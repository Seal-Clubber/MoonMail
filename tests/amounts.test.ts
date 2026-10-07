import { expect, it } from "vitest";
import { tari, toMicroTari } from "../src/ui/AmountInput";

it("preserves decimal gift amounts and the full ledger range without rounding", () => {
  for (const micro of [
    "0",
    "1",
    "100000",
    "1234567",
    "10000000000",
    "18446744073709551615",
  ]) {
    expect(toMicroTari(tari(micro))).toBe(micro);
  }
  expect(toMicroTari("1.234567")).toBe("1234567");
  expect(toMicroTari("1.")).toBe("1000000");
  expect(toMicroTari("0001.20")).toBe("1200000");
});

it("rejects rounding, exponent notation, negatives and amounts above the ledger limit", () => {
  for (const value of [
    "",
    ".",
    "1.0000001",
    "1e6",
    "-1",
    "NaN",
    "1,000",
    "18446744073709.551616",
  ]) {
    expect(() => toMicroTari(value)).toThrow();
  }
});
