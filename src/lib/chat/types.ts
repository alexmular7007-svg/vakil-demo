// Shared between the chat route handler and the browser.

export type CitationStatus = "verified" | "in_corpus" | "not_in_corpus" | "in_library" | "unverified" | "invalid";

export type ChatCitation = {
  id: string;
  kind: "statute" | "document" | "judgment" | "case";
  label: string;
  href: string | null;
  status: CitationStatus;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: ChatCitation[] | null;
  model?: string | null;
  createdAt?: string;
};

/** NDJSON events streamed by POST /api/chat. */
export type ChatStreamEvent =
  | { t: "meta"; chatId: string; userMessageId: string; assistantMessageId: string; sourceCount: number }
  | { t: "delta"; v: string }
  | {
      t: "done";
      citations: ChatCitation[];
      model: string;
      downgraded: boolean;
      refused: boolean;
      truncated: boolean;
      title?: string;
    }
  | { t: "error"; message: string; retryable: boolean; code?: ChatErrorCode };

/**
 * Error codes shared by the stream's error event and JSON error responses
 * ({ error, code, retryable }) sent before the stream starts.
 */
export type ChatErrorCode =
  | "auth"
  | "rate_limit"
  | "unavailable"
  | "bad_request"
  | "not_found"
  | "fair_use"
  | "provider"
  | "internal";

export type ChatModeOption = "research" | "draft" | "explain";
