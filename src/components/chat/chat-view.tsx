"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowUp,
  BookMarked,
  Bot,
  Briefcase,
  Check,
  Copy,
  History,
  Languages,
  Loader2,
  Mic,
  RotateCcw,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/display";
import { Select } from "@/components/ui/form";
import { Dialog, Tabs } from "@/components/ui/overlay";
import type { ChatCitation, ChatMessage, ChatModeOption, ChatStreamEvent } from "@/lib/chat/types";
import { sendFeedback } from "@/app/app/chat/actions";
import { cn } from "@/lib/utils";
import { AnswerMarkdown } from "./markdown";
import { CitationList } from "./citation-list";
import { useDictation } from "./use-dictation";
import { LogoMark } from "@/components/brand";

type PromptOption = { id: string; title: string; body: string; category: string; mine: boolean };
type Option = { id: string; name?: string; title?: string };

type UiMessage = ChatMessage & { pending?: boolean; error?: string; notice?: string };

const suggestions = [
  { mode: "research" as const, text: "What must the prosecution prove for cheating under the BNS, and what is the punishment?" },
  { mode: "research" as const, text: "Offence committed in March 2024: which code applies to the bail application, CrPC or BNSS?" },
  { mode: "draft" as const, text: "Draft a reply to a legal notice demanding unpaid rent, denying the amount claimed." },
  { mode: "explain" as const, text: "चेक बाउंस होने पर क्या कानूनी प्रक्रिया होती है? सरल भाषा में समझाइए।" },
];

const modeLabels: Record<ChatModeOption, string> = { research: "Research", draft: "Draft", explain: "Explain simply" };

export function ChatView({
  chatId: initialChatId,
  initialMessages = [],
  initialMode = "research",
  initialLanguage = "en",
  aiEnabled,
  canUseDeep,
  assistants,
  prompts,
  matters,
  preset,
}: {
  chatId?: string;
  initialMessages?: ChatMessage[];
  initialMode?: ChatModeOption;
  initialLanguage?: "en" | "hi";
  aiEnabled: boolean;
  canUseDeep: boolean;
  assistants: Option[];
  prompts: PromptOption[];
  matters: Option[];
  preset?: { assistantId?: string; promptBody?: string; matterId?: string };
}) {
  const router = useRouter();
  const [chatId, setChatId] = useState(initialChatId);
  const [msgs, setMsgs] = useState<UiMessage[]>(initialMessages);
  const [input, setInput] = useState(preset?.promptBody ?? "");
  const [mode, setMode] = useState<ChatModeOption>(initialMode);
  const [language, setLanguage] = useState<"en" | "hi">(initialLanguage);
  const [deep, setDeep] = useState(false);
  const [assistantId, setAssistantId] = useState(preset?.assistantId ?? "");
  const [matterId, setMatterId] = useState(preset?.matterId ?? "");
  const [busy, setBusy] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isNewChat = !initialChatId && msgs.length === 0;
  const dictation = useDictation(language, (text) => setInput((cur) => (cur.trim() ? `${cur.trimEnd()} ${text}` : text)));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [input]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy || !aiEnabled) return;
    setInput("");
    setBusy(true);
    const userMsg: UiMessage = { id: `local-${Date.now()}`, role: "user", text: message };
    const assistantLocalId = `pending-${Date.now()}`;
    setMsgs((m) => [...m, userMsg, { id: assistantLocalId, role: "assistant", text: "", pending: true }]);

    const controller = new AbortController();
    abortRef.current = controller;
    let assistantId_ = assistantLocalId;
    const wasNew = !chatId;

    const patch = (fn: (m: UiMessage) => UiMessage) =>
      setMsgs((all) => all.map((m) => (m.id === assistantId_ ? fn(m) : m)));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          chatId,
          message,
          mode,
          language,
          deep,
          assistantId: assistantId || undefined,
          matterId: matterId || undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed." }));
        patch((m) => ({ ...m, pending: false, error: err.error ?? "Request failed." }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as ChatStreamEvent;
          if (ev.t === "meta") {
            if (!chatId) {
              setChatId(ev.chatId);
              window.history.replaceState(null, "", `/app/chat/${ev.chatId}`);
            }
            setMsgs((all) =>
              all.map((m) =>
                m.id === assistantId_ ? { ...m, id: ev.assistantMessageId } : m.id === userMsg.id ? { ...m, id: ev.userMessageId } : m,
              ),
            );
            assistantId_ = ev.assistantMessageId;
          } else if (ev.t === "delta") {
            patch((m) => ({ ...m, text: m.text + ev.v }));
          } else if (ev.t === "done") {
            finished = true;
            patch((m) => ({
              ...m,
              pending: false,
              citations: ev.citations,
              model: ev.model,
              notice: ev.downgraded
                ? "You have passed today's fair-use level, so this answer used the faster model."
                : ev.truncated
                  ? "The answer hit the length limit. Ask a narrower follow-up to continue."
                  : undefined,
            }));
            // Show the new conversation in the history list.
            if (wasNew) router.refresh();
          } else if (ev.t === "error") {
            finished = true;
            patch((m) => ({ ...m, pending: false, error: ev.message }));
          }
        }
      }
      // The server closed the stream without a final event (crash, deploy, proxy timeout).
      if (!finished) patch((m) => ({ ...m, pending: false, error: "The answer was interrupted. Please try again." }));
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        patch((m) => ({ ...m, pending: false, text: m.text || "_(Stopped)_" }));
      } else {
        patch((m) => ({ ...m, pending: false, error: "Connection lost. Please try again." }));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  function retry(failedId: string) {
    const idx = msgs.findIndex((m) => m.id === failedId);
    const prevUser = [...msgs.slice(0, idx)].reverse().find((m) => m.role === "user");
    if (!prevUser) return;
    setMsgs((all) => all.filter((m) => m.id !== failedId && m.id !== prevUser.id));
    void send(prevUser.text);
  }

  return (
    <div className="flex h-[calc(100dvh-188px)] min-h-[420px] flex-col md:h-[calc(100dvh-68px)] lg:h-[calc(100dvh-104px)]">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3">
        <Link
          href="/app/chat/history"
          className="inline-flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink lg:hidden"
          aria-label="Conversation history"
        >
          <History className="size-[18px]" />
        </Link>
        <Tabs
          value={mode}
          onChange={(v) => setMode(v as ChatModeOption)}
          tabs={(Object.keys(modeLabels) as ChatModeOption[]).map((k) => ({ value: k, label: modeLabels[k] }))}
          className="max-w-full overflow-x-auto"
        />
        <button
          type="button"
          onClick={() => setLanguage(language === "en" ? "hi" : "en")}
          className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-sm text-ink-2 hover:bg-surface-2"
          aria-label={language === "en" ? "Answer in Hindi" : "Answer in English"}
        >
          <Languages className="size-4" /> {language === "en" ? "EN" : "हिं"}
        </button>
        {!isNewChat ? (
          <Button asChild variant="outline" size="sm" className="max-sm:hidden">
            <Link href="/app/chat">New chat</Link>
          </Button>
        ) : null}
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin rounded-lg border border-border bg-surface" aria-live="polite">
        {msgs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
            <span className="relative inline-flex">
              <span className="absolute -inset-2 rounded-[20px] border border-gold/40" aria-hidden />
              <LogoMark className="size-14" />
            </span>
            <h2 className="mt-5 font-serif text-[26px] font-semibold text-ink">What are you working on?</h2>
            <p className="mt-1 max-w-md text-sm text-muted">
              Answers cite the bare acts and your documents. Every reference is checked before you see it. Type or tap the microphone to speak in
              English or Hindi.
            </p>
            <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  disabled={!aiEnabled}
                  onClick={() => {
                    setMode(s.mode);
                    if (/[ऀ-ॿ]/.test(s.text)) setLanguage("hi");
                    void send(s.text);
                  }}
                  className="pressable rounded-lg border border-border bg-bg p-3.5 text-left text-sm text-ink-2 transition-colors hover:border-primary/40 hover:bg-primary-soft/40 disabled:opacity-50"
                >
                  <Badge tone={s.mode === "draft" ? "info" : s.mode === "explain" ? "accent" : "primary"} dot className="mb-1.5">
                    {modeLabels[s.mode]}
                  </Badge>
                  <span className="block" lang={/[ऀ-ॿ]/.test(s.text) ? "hi" : undefined}>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-3 py-5 sm:px-6">
            {msgs.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div
                    className="max-w-[88%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-[15px] whitespace-pre-wrap text-primary-ink sm:max-w-[80%]"
                    lang={/[ऀ-ॿ]/.test(m.text) ? "hi" : undefined}
                  >
                    {m.text}
                  </div>
                </div>
              ) : (
                <AssistantMessage key={m.id} m={m} chatId={chatId} onRetry={() => retry(m.id)} language={language} />
              ),
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="pt-3">
        {!aiEnabled ? (
          <Alert tone="warning" className="mb-2">
            AI answers are not switched on yet. An administrator needs to add an Anthropic or Google AI key.
          </Alert>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="rounded-xl border border-border-input/70 bg-surface shadow-md focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15"
        >
          <label htmlFor="chat-input" className="sr-only">
            Your question
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={8000}
            disabled={!aiEnabled}
            placeholder={mode === "draft" ? "Describe the document and the facts…" : "Ask about Indian law, a section, or your documents…"}
            className="block max-h-[220px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-base text-ink outline-none placeholder:text-placeholder sm:text-[15px]"
          />
          <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
            <button
              type="button"
              onClick={() => setPromptsOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-ink-2 hover:bg-surface-2"
            >
              <BookMarked className="size-4" /> Prompts
            </button>
            {assistants.length > 0 ? (
              <label className="inline-flex items-center gap-1 text-[13px] text-ink-2">
                <Bot className="size-4 text-muted" aria-hidden />
                <span className="sr-only">Assistant</span>
                <Select
                  value={assistantId}
                  onChange={(e) => setAssistantId(e.target.value)}
                  className="h-8 w-auto max-w-[9rem] border-0 bg-transparent py-0 pr-7 pl-1 text-[13px] shadow-none sm:max-w-[12rem]"
                  disabled={Boolean(chatId) && msgs.length > 0}
                >
                  <option value="">Vaakil AI</option>
                  {assistants.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            {matters.length > 0 ? (
              <label className="inline-flex items-center gap-1 text-[13px] text-ink-2">
                <Briefcase className="size-4 text-muted" aria-hidden />
                <span className="sr-only">Matter</span>
                <Select
                  value={matterId}
                  onChange={(e) => setMatterId(e.target.value)}
                  className="h-8 w-auto max-w-[9rem] border-0 bg-transparent py-0 pr-7 pl-1 text-[13px] shadow-none sm:max-w-[12rem]"
                  disabled={Boolean(chatId) && msgs.length > 0}
                >
                  <option value="">No matter</option>
                  {matters.map((mm) => (
                    <option key={mm.id} value={mm.id}>
                      {mm.title}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            {canUseDeep ? (
              <button
                type="button"
                onClick={() => setDeep((d) => !d)}
                aria-pressed={deep}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px]",
                  deep ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2",
                )}
                title="Use the strongest model for harder questions (uses more of your fair-use allowance)"
              >
                <Sparkles className="size-4" /> Deep
              </button>
            ) : null}
            <div className="ml-auto flex items-center gap-1.5">
              {dictation.supported && aiEnabled && !busy ? (
                <button
                  type="button"
                  onClick={dictation.listening ? dictation.stop : dictation.start}
                  aria-pressed={dictation.listening}
                  aria-label={dictation.listening ? "Stop voice input" : `Speak your question in ${language === "hi" ? "Hindi" : "English"}`}
                  title={dictation.error ?? (language === "hi" ? "Speak in Hindi" : "Speak in English")}
                  className={cn(
                    "inline-flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors",
                    dictation.listening ? "animate-pulse bg-danger text-white" : "text-ink-2 hover:bg-surface-2",
                  )}
                >
                  <Mic className="size-[18px]" />
                </button>
              ) : null}
              {busy ? (
                <Button type="button" size="icon-sm" variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Stop">
                  <Square className="size-3.5 fill-current" />
                </Button>
              ) : (
                <Button type="submit" size="icon-sm" disabled={!input.trim() || !aiEnabled} aria-label="Send" className="size-10">
                  <ArrowUp />
                </Button>
              )}
            </div>
          </div>
        </form>
        <p className="mt-2 text-center text-[11px] text-muted">
          AI can be wrong. Check every citation before relying on it. Legal information, not legal advice.
        </p>
      </div>

      <Dialog open={promptsOpen} onClose={() => setPromptsOpen(false)} title="Prompt library" description="Pick a prompt, then fill in the parts in braces.">
        <div className="space-y-4">
          {Object.entries(
            prompts.reduce<Record<string, PromptOption[]>>((acc, p) => {
              const k = p.mine ? "My prompts" : p.category;
              (acc[k] ??= []).push(p);
              return acc;
            }, {}),
          ).map(([cat, list]) => (
            <div key={cat}>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{cat}</p>
              <div className="grid gap-1.5">
                {list.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setInput(p.body);
                      setPromptsOpen(false);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    className="rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary/40 hover:bg-primary-soft/30"
                  >
                    <span className="font-medium text-ink">{p.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{p.body}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <Link href="/app/assistants?tab=prompts" className="inline-block text-sm text-primary hover:underline">
            Manage my prompts
          </Link>
        </div>
      </Dialog>
    </div>
  );
}

function AssistantMessage({
  m,
  chatId,
  onRetry,
  language,
}: {
  m: UiMessage;
  chatId?: string;
  onRetry: () => void;
  language: "en" | "hi";
}) {
  const [copied, setCopied] = useState(false);
  const [rated, setRated] = useState<"up" | "down" | null>(null);
  const [, start] = useTransition();
  const isPersisted = !m.id.startsWith("pending-");
  const hindi = /[ऀ-ॿ]/.test(m.text) || language === "hi";

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 hidden size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary sm:inline-flex">
        <Sparkles className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        {m.text ? (
          <AnswerMarkdown text={m.text} citations={m.citations as ChatCitation[] | null} messageId={m.id} lang={hindi ? "hi" : undefined} />
        ) : m.pending ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Searching the bare acts and drafting an answer…
          </p>
        ) : null}
        {m.error ? (
          <Alert
            tone="danger"
            className="mt-2"
            action={
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RotateCcw /> Retry
              </Button>
            }
          >
            {m.error}
          </Alert>
        ) : null}
        {m.notice ? <p className="mt-2 text-[13px] text-muted">{m.notice}</p> : null}
        {m.citations && m.citations.length > 0 ? <CitationList citations={m.citations as ChatCitation[]} messageId={m.id} /> : null}
        {!m.pending && !m.error && m.text && isPersisted ? (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-muted">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(m.text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] hover:bg-surface-2 hover:text-ink"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
            </button>
            {(["up", "down"] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-label={r === "up" ? "Helpful" : "Not helpful"}
                aria-pressed={rated === r}
                disabled={rated !== null}
                onClick={() =>
                  start(async () => {
                    const res = await sendFeedback(m.id, r);
                    if (res.ok) {
                      setRated(r);
                      toast.success("Thanks for the feedback");
                    }
                  })
                }
                className={cn("inline-flex size-8 items-center justify-center rounded-md hover:bg-surface-2 hover:text-ink", rated === r && "text-primary")}
              >
                {r === "up" ? <ThumbsUp className="size-3.5" /> : <ThumbsDown className="size-3.5" />}
              </button>
            ))}
            {chatId ? (
              <Link
                href={`/app/advocates?chat=${chatId}`}
                className="ml-auto inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-primary hover:bg-primary-soft"
              >
                <UsersRound className="size-3.5" /> Ask a verified advocate
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
