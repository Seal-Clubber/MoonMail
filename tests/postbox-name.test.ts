import { expect, it } from "vitest";
import { postboxNameError } from "../src/core/postbox-name";

it("matches the deployed Rust 80-byte name boundary across ASCII, accents and emoji", () => {
  for (const name of ["a".repeat(80), "é".repeat(40), "👻".repeat(20)])
    expect(postboxNameError(name)).toBeUndefined();
  for (const name of ["a".repeat(81), "é".repeat(41), "👻".repeat(21)])
    expect(postboxNameError(name)).toContain("shorter postbox name");
});
it("requires a visible name while preserving valid surrounding spaces", () => {
  for (const name of ["", "   ", "\t\n"])
    expect(postboxNameError(name)).toBe("Choose a postbox name.");
  expect(postboxNameError(" Moonlit corner ")).toBeUndefined();
});
