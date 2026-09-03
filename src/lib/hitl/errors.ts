export type HitlErrorCode =
  | "NOT_FOUND"
  | "ALREADY_DECIDED"
  | "INVALID"
  | "FORBIDDEN"
  | "UNAUTHORIZED";

export class HitlError extends Error {
  readonly code: HitlErrorCode;
  readonly status: number;

  constructor(code: HitlErrorCode, message: string) {
    super(message);
    this.name = "HitlError";
    this.code = code;
    this.status =
      code === "NOT_FOUND"
        ? 404
        : code === "ALREADY_DECIDED"
          ? 409
          : code === "FORBIDDEN"
            ? 403
            : code === "UNAUTHORIZED"
              ? 401
              : 400;
  }
}

export function hitlStatus(error: unknown): number {
  return error instanceof HitlError ? error.status : 500;
}
