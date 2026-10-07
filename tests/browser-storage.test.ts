import { expect, it } from "vitest";
import { checkBrowserStorage } from "../src/core/browser-storage";
function storage() {
  const data = new Map([
    ["ghostdrop:pending:v1", "existing financial journal"],
  ]);
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
it("checks writable storage without altering financial records or leaving its probe", () => {
  const s = storage();
  expect(checkBrowserStorage(s)).toBeUndefined();
  expect([...s.data]).toEqual([
    ["ghostdrop:pending:v1", "existing financial journal"],
  ]);
});
it("denied writes pause financial storage and preserve the journal", () => {
  const s = storage();
  expect(
    checkBrowserStorage({
      ...s,
      setItem: () => {
        throw new Error("Quota exceeded");
      },
    }),
  ).toContain("sending and collection are paused");
  expect([...s.data]).toEqual([
    ["ghostdrop:pending:v1", "existing financial journal"],
  ]);
});
it("a store that silently discards writes is not accepted as durable", () => {
  const s = storage();
  expect(checkBrowserStorage({ ...s, setItem: () => {} })).toContain(
    "cannot save delivery records",
  );
  expect([...s.data]).toEqual([
    ["ghostdrop:pending:v1", "existing financial journal"],
  ]);
});
it("a denied read cleans only its probe and never clears existing journals", () => {
  const s = storage();
  expect(
    checkBrowserStorage({
      ...s,
      getItem: () => {
        throw new Error("Access denied");
      },
    }),
  ).toBeDefined();
  expect([...s.data]).toEqual([
    ["ghostdrop:pending:v1", "existing financial journal"],
  ]);
});
