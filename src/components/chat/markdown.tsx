"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatCitation } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/**
 * Renders an answer. `[S1]` markers become citation chips that scroll to the
 * source card. Raw HTML is never rendered (react-markdown escapes it).
 */
export function AnswerMarkdown({
  text,
  citations,
  messageId,
  lang,
}: {
  text: string;
  citations?: ChatCitation[] | null;
  messageId: string;
  lang?: string;
}) {
  const statusById = new Map((citations ?? []).map((c) => [c.id, c.status]));
  const prepared = text.replace(/\[(S\d{1,2})\]/g, (_m, id) => `[${id}](#cite-${messageId}-${id})`);
  return (
    <div className="prose-legal min-w-0 break-words" lang={lang}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            if (href?.startsWith(`#cite-${messageId}-`)) {
              const id = href.split("-").pop() ?? "";
              const status = statusById.get(id);
              return (
                <a
                  href={href}
                  className={cn(
                    "mx-0.5 inline-flex items-center rounded px-1 align-[1px] text-[11px] font-semibold no-underline",
                    status === "invalid" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary",
                  )}
                  aria-label={`Source ${id}`}
                >
                  {children}
                </a>
              );
            }
            const external = href && /^https?:/.test(href);
            return (
              <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}
