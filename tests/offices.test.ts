import { expect, test } from "vitest";
import {
  knownOffice,
  reviewedOffice,
  rememberedOffice,
  rememberOffice,
  officeFile,
} from "../src/core/offices";
import { writesReady, mailboxStateReady } from "../src/core/config";

test("only exact reviewed office identities select a protocol; a link cannot grant evidence", () => {
  for (const choice of ["existing", "sealed"] as const) {
    const d = reviewedOffice(choice);
    expect(knownOffice(d)).toBe(choice);
    expect(writesReady(d, "postbox", "sapient")).toBe(true);
    expect(mailboxStateReady(d)).toBe(true);
    for (const changed of [
      { network: 16 },
      { registry: `component_${"f".repeat(64)}` },
      { template: "f".repeat(64) },
    ])
      expect(knownOffice({ ...d, ...changed })).toBeUndefined();
  }
});
test("office choice is only a public preference and defaults safely when storage is unavailable", () => {
  let value: string | null = null;
  const storage = {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
  expect(rememberedOffice(storage)).toBe("existing");
  rememberOffice(storage, "sealed");
  expect(officeFile(rememberedOffice(storage))).toBe("deployment-v4.json");
  value = "https://untrusted.invalid/office";
  expect(rememberedOffice(storage)).toBe("existing");
  expect(
    rememberedOffice({
      getItem: () => {
        throw Error("blocked");
      },
    }),
  ).toBe("existing");
});
