import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { assistants, chats, documents, matters, messages } from "@/lib/db/schema";
import { features } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { aiConfig, chatTier } from "@/lib/ai/config";
import { planContext } from "@/lib/ai/context";
import { AiProviderError, FairUseLimitError, isAbortedError } from "@/lib/ai/errors";
import { AiUnavailableError, generateCompletion, streamCompletion, type ChatTurn, type CompletionResult } from "@/lib/ai/gateway";
import { buildSystemPrompt, TITLE_PROMPT } from "@/lib/ai/prompts";
import { matterNote, retrieveSources } from "@/lib/ai/retrieval";
import { verifyCitations, type Citation } from "@/lib/ai/citations";
import { logAiError } from "@/lib/ai/safe-log";
import { sanitizeInline } from "@/lib/ai/untrusted";
import { chatErrorResponse, ndjsonStream, readJsonBody } from "@/lib/chat/stream";

export const maxDuration = 300;

const MAX_QUESTION_CHARS = 8000;

const Body = z.object({
  chatId: z.uuid().optional(),
  message: z
    .string()
    .trim()
    .min(1, "Type a question")
    .max(MAX_QUESTION_CHARS, "Keep questions under 8,000 characters"),
  mode: z.enum(["research", "draft", "explain"]).default("research"),
  language: z.enum(["en", "hi"]).default("en"),
  deep: z.boolean().default(false),
  assistantId: z.uuid().optional(),
  matterId: z.uuid().optional(),
});

const REFUSAL_TEXT =
  "I can't help with that request. If this seems wrong, rephrase the question with the legal issue you are researching.";

/** Short single-line chat title from the fast model's reply. */
function cleanTitle(raw: string): string | undefined {
  const t = sanitizeInline(raw, 80)
    .replace(/^["'“‘]+|["'”’.]+$/g, "")
    .trim();
  return t || undefined;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return chatErrorResponse(401, "Please sign in.", "auth");

  const rl = await rateLimit(`chat:${user.id}`, 20, 60);
  if (!rl.ok) {
    const wait = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
    return chatErrorResponse(429, "You are sending messages too quickly. Wait a moment.", "rate_limit", {
      retryable: true,
      headers: { "Retry-After": String(wait) },
    });
  }

  if (!features.ai) return chatErrorResponse(503, new AiUnavailableError().message, "unavailable");

  const raw = await readJsonBody(req);
  if (!raw.ok) return chatErrorResponse(raw.status, raw.error, "bad_request");
  const parsed = Body.safeParse(raw.value);
  if (!parsed.success) return chatErrorResponse(400, parsed.error.issues[0]?.message ?? "Invalid request", "bad_request");
  const body = parsed.data;

  // Load or create the chat, history, assistant and matter under row-level security.
  type Ctx = NonNullable<Awaited<ReturnType<typeof loadContext>>>;
  async function loadContext() {
    return withUser(user!.id, async (tx) => {
      let chat: typeof chats.$inferSelect | undefined;
      let isNew = false;
      if (body.chatId) {
        [chat] = await tx.select().from(chats).where(eq(chats.id, body.chatId)).limit(1);
        if (!chat) return null;
      } else {
        [chat] = await tx
          .insert(chats)
          .values({
            ownerId: user!.id,
            title: body.message.slice(0, 60).replace(/\s+/g, " "),
            mode: body.mode,
            language: body.language,
            assistantId: body.assistantId ?? null,
            matterId: body.matterId ?? null,
          })
          .returning();
        isNew = true;
      }

      const historyLimit = aiConfig.context.historyMessages;
      const history =
        historyLimit > 0
          ? await tx
              .select({ role: messages.role, parts: messages.parts })
              .from(messages)
              .where(eq(messages.chatId, chat.id))
              .orderBy(desc(messages.createdAt))
              .limit(historyLimit)
          : [];

      const assistantId = body.assistantId ?? chat.assistantId;
      const [assistant] = assistantId
        ? await tx.select().from(assistants).where(eq(assistants.id, assistantId)).limit(1)
        : [];

      const matterId = body.matterId ?? chat.matterId;
      const [matter] = matterId ? await tx.select().from(matters).where(eq(matters.id, matterId)).limit(1) : [];

      // Documents the answer may draw on: the matter's files and the assistant's knowledge files.
      const docIds = new Set<string>(assistant?.knowledgeDocumentIds ?? []);
      if (matter) {
        const rows = await tx
          .select({ id: documents.id })
          .from(documents)
          .where(and(eq(documents.matterId, matter.id), eq(documents.status, "ready")))
          .orderBy(asc(documents.createdAt))
          .limit(20);
        rows.forEach((r) => docIds.add(r.id));
      }

      const sources = await retrieveSources(tx, { question: body.message, documentIds: [...docIds] });

      const userMessageId = randomUUID();
      await tx.insert(messages).values({
        id: userMessageId,
        chatId: chat.id,
        ownerId: user!.id,
        role: "user",
        parts: [{ type: "text", text: body.message }],
      });

      return { chat, isNew, history: history.reverse(), assistant, matter, sources, userMessageId };
    });
  }

  let ctx: Ctx | null;
  try {
    ctx = await loadContext();
  } catch (err) {
    logAiError("chat", "could not prepare the conversation", err);
    return chatErrorResponse(500, "Could not load the conversation. Please try again.", "internal", { retryable: true });
  }
  if (!ctx) return chatErrorResponse(404, "Conversation not found.", "not_found");
  const c = ctx;

  const system = buildSystemPrompt({
    mode: body.mode,
    language: body.language,
    assistant: c.assistant ? { name: c.assistant.name, instructions: c.assistant.instructions } : null,
  });

  const history: ChatTurn[] = c.history.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: ((m.parts as { type: string; text?: string }[]) ?? []).map((p) => p.text ?? "").join(""),
  }));

  // Keep the prompt within the context budget: exact statute matches first, then
  // judgments, then documents; older history goes before sources. The fitted
  // sources (renumbered S1 …) are the ones the citation check uses.
  const plan = planContext({
    system,
    history,
    question: body.message,
    matterNote: matterNote(c.matter?.offenceDate ?? null),
    sources: c.sources,
  });
  const sources = plan.sources;
  const turns: ChatTurn[] = [...plan.history, { role: "user", content: plan.userTurn }];

  const tier = chatTier({ deep: body.deep, mode: body.mode, assistantTier: c.assistant?.modelTier });
  const assistantMessageId = randomUUID();
  const userId = user.id;

  const stream = ndjsonStream(
    async ({ send, signal }) => {
      send({ t: "meta", chatId: c.chat.id, userMessageId: c.userMessageId, assistantMessageId, sourceCount: sources.length });

      let text = "";
      let result: CompletionResult | undefined;
      let stopped = false;
      const it = streamCompletion({ userId, tier, system, messages: turns, signal });
      try {
        for (;;) {
          if (signal.aborted) {
            // Ends the provider stream and records the usage so far.
            await it.return(undefined as never);
            stopped = true;
            break;
          }
          const next = await it.next();
          if (next.done) {
            result = next.value;
            break;
          }
          text += next.value;
          send({ t: "delta", v: next.value });
        }
      } catch (err) {
        if (!isAbortedError(err) && !signal.aborted) throw err;
        stopped = true;
      }

      if (stopped) text = text ? `${text}\n\n_(Stopped)_` : "_(Stopped)_";
      if (result?.refused && !text.trim()) text = REFUSAL_TEXT;

      const [citations, title] = await Promise.all([
        verifyCitations(text, sources).catch((err): Citation[] => {
          logAiError("chat", "citation check failed", err);
          return [];
        }),
        c.isNew && !stopped
          ? generateCompletion({
              userId,
              tier: aiConfig.routing.title,
              internal: true,
              system: TITLE_PROMPT,
              messages: [{ role: "user", content: body.message.slice(0, 1000) }],
              maxTokens: 40,
              signal,
            })
              .then((r) => cleanTitle(r.text))
              .catch(() => undefined)
          : Promise.resolve(undefined),
      ]);

      // Saved even when the client has gone, so a stopped answer stays in the history.
      await withUser(userId, async (tx) => {
        await tx.insert(messages).values({
          id: assistantMessageId,
          chatId: c.chat.id,
          ownerId: userId,
          role: "assistant",
          parts: [{ type: "text", text }],
          citations,
          provider: result?.provider ?? null,
          model: result?.model ?? null,
          tokensIn: result?.tokensIn ?? null,
          tokensOut: result?.tokensOut ?? null,
        });
        await tx
          .update(chats)
          .set({ updatedAt: new Date(), ...(title ? { title } : {}) })
          .where(eq(chats.id, c.chat.id));
      });

      send({
        t: "done",
        citations,
        model: result?.model ?? "",
        downgraded: result?.downgraded ?? false,
        refused: result?.refused ?? false,
        truncated: result?.truncated ?? false,
        title,
      });
    },
    {
      signal: req.signal,
      // Provider failures are logged by the gateway; never log message content.
      onError: (err) => {
        if (!(err instanceof FairUseLimitError || err instanceof AiProviderError)) logAiError("chat", "answer failed", err, { tier });
      },
    },
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
