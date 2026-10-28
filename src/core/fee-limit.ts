export type FeeOperation =
  | "publish"
  | "claim"
  | "postbox"
  | "capsule"
  | "mailbox"
  | "private-payment";
export interface FeeProblem {
  operation: FeeOperation;
  mode: "low" | "locked" | "restore";
  required?: string;
}
export class FeeLimitError extends Error {
  readonly problem: FeeProblem;
  constructor(
    operation: FeeOperation,
    mode: FeeProblem["mode"],
    required?: string,
  ) {
    super(
      mode === "low"
        ? "The network fee cap is too low. Nothing was submitted. Review the fee warning to adjust it."
        : mode === "restore"
          ? "Resume with the original approval's fee limit. MoonMail will not replace that approval."
          : "Sapient reported a fee problem for the original request. Check Activity and Sapient before another attempt; fees may already have been paid.",
    );
    this.name = "FeeLimitError";
    this.problem = {
      operation,
      mode,
      ...(required && /^[1-9][0-9]*$/.test(required) ? { required } : {}),
    };
  }
}
// Wallet text is used only to classify a fee problem, never displayed or logged.
// Once a request may exist, it must remain locked rather than authorizing a retry.
export function walletFeeFailure(error: unknown, operation: FeeOperation) {
  if (error instanceof FeeLimitError) return error;
  const value =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? error.message
        : undefined;
  return typeof value === "string" &&
    /insufficient\s+fee|fee\s+(?:budget|cap|limit|payment).*(?:too low|exhausted|insufficient|exceeded)|exceed(?:ed|s).*(?:fee cap|fee budget|fee limit)|FeePaymentFailure/i.test(
      value,
    )
    ? new FeeLimitError(operation, "locked")
    : undefined;
}
export function validFee(value: string) {
  return /^[1-9][0-9]*$/.test(value) && BigInt(value) <= 18446744073709551615n;
}
