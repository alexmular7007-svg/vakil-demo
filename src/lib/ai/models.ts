import "server-only";
import { aiConfig } from "./config";

// Kept for existing imports (admin AI page, gateway callers). The routing table,
// effort and every other AI setting now live in ./config.ts with env overrides.
export { costMicros, type Effort, type ModelSpec, type Provider, type Tier } from "./config";

/** Model ids and list prices per provider and tier, after env overrides. */
export const MODELS = aiConfig.models;

/** Claude effort per tier, after env overrides. */
export const EFFORT = aiConfig.effort;
