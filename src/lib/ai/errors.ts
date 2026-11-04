// Typed errors of the AI gateway. Re-exported from ./gateway, which is where
// callers import them from; kept here so light modules (the chat stream, tests)
// can use them without loading the provider SDKs.

/** Why a provider attempt failed (internal; never shown to users as is). */
export type AiFailureKind =
  | "rate_limit"
  | "overloaded"
  | "server"
  | "network"
  | "timeout"
  | "deadline"
  | "auth"
  | "bad_request"
  | "circuit_open"
  | "aborted"
  | "unknown";

export class AiUnavailableError extends Error {
  constructor() {
    super("AI is not configured on this server. An administrator needs to add an Anthropic or Google AI key.");
  }
}

export class FairUseLimitError extends Error {
  constructor(public limit: number) {
    super(`You have reached today's limit of ${limit} AI requests on your plan. It resets at midnight IST.`);
  }
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    /** True when the user can usefully try again. */
    public retryable: boolean,
    /** What went wrong, for logs and for callers that treat cancellation differently. */
    public kind: AiFailureKind = "unknown",
  ) {
    super(message);
  }
}

/** User-facing message and retry hint for each failure kind. */
export function providerError(kind: AiFailureKind): AiProviderError {
  switch (kind) {
    case "rate_limit":
    case "overloaded":
      return new AiProviderError("The AI provider is busy. Please try again in a moment.", true, kind);
    case "auth":
      return new AiProviderError("The AI provider rejected the server's API key.", false, kind);
    case "bad_request":
      return new AiProviderError("The AI request was rejected. Try a shorter question.", false, kind);
    case "server":
      return new AiProviderError("The AI provider had a problem answering. Please try again.", true, kind);
    case "timeout":
      return new AiProviderError("The AI provider took too long to respond. Please try again.", true, kind);
    case "deadline":
      return new AiProviderError("The answer took too long and was stopped. Try a narrower question.", true, kind);
    case "circuit_open":
      return new AiProviderError("The AI service is temporarily unavailable after repeated errors. Please try again in a minute.", true, kind);
    case "aborted":
      return new AiProviderError("The request was cancelled.", false, kind);
    case "network":
    case "unknown":
    default:
      return new AiProviderError("The AI service could not be reached. Please try again.", true, kind);
  }
}

export function isAbortedError(err: unknown): boolean {
  return err instanceof AiProviderError && err.kind === "aborted";
}
