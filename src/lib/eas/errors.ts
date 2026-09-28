export type EasErrorCode = "auth" | "setup" | "ios-credentials" | "apple" | "failed";

export class EasError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code: EasErrorCode = "failed",
    /** Extra fields for the response, e.g. a certificate made before the failure. */
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}
