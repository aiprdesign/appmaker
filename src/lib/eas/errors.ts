export type EasErrorCode = "auth" | "setup" | "ios-credentials" | "apple" | "failed";

export class EasError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code: EasErrorCode = "failed",
  ) {
    super(message);
  }
}
