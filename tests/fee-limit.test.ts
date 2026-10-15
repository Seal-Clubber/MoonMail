import { expect, test } from "vitest";
import {
  FeeLimitError,
  walletFeeFailure,
  validFee,
} from "../src/core/fee-limit";
test("only a verified pre-submission estimate offers a fee adjustment", () => {
  const low = new FeeLimitError("publish", "low", "200000");
  expect(low.problem).toEqual({
    operation: "publish",
    mode: "low",
    required: "200000",
  });
  const locked = walletFeeFailure(
    new Error(
      "FeePaymentFailure: fee budget too low; private memo must stay hidden",
    ),
    "publish",
  )!;
  expect(locked.problem.mode).toBe("locked");
  expect(locked.message).not.toContain("private memo");
  for (const e of [
    Error("insufficient funds"),
    Error("Request timed out"),
    Error("user rejected"),
    { message: 123 },
  ])
    expect(walletFeeFailure(e, "publish")).toBeUndefined();
});
test("fee limits stay exact positive u64 amounts", () => {
  for (const v of ["", "0", "-1", "1.2", "01", "18446744073709551616"])
    expect(validFee(v)).toBe(false);
  for (const v of ["1", "30000", "18446744073709551615"])
    expect(validFee(v)).toBe(true);
});
