// Vendored subset of cubiczan-resilience (typescript/src).
// No npm registry is available, so the primitives are copied here verbatim.
// Only the pieces the audit required are vendored: safeFetch (timeout + retry
// + backoff) and its dependencies (retry, errors). Keep .js import specifiers
// — the repo uses bundler moduleResolution which resolves them to the .ts.
export {
  ResilienceError,
  isResilienceError,
  type ResilienceErrorKind,
  type ResilienceErrorOptions,
} from "./errors.js";

export { retry, computeBackoff, type RetryOptions } from "./retry.js";

export {
  safeFetch,
  type SafeFetchOptions,
  type AllowlistHook,
} from "./safeFetch.js";
