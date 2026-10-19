import { describe, expect, it } from "vitest";
import { filterHallMail } from "../src/core/mail-search";
import { emptyDeployment } from "../src/core/config";
import type { Envelope } from "../src/core/types";
const base = {
  context: emptyDeployment,
  gift: "0",
  reserve: "0",
  claimed: false,
  sender: "fixture",
};
const letters: Envelope[] = [
  {
    ...base,
    id: "public-moon",
    mode: "public",
    payload: {
      subject: "Moonlit hello",
      body: "Kindness for a wandering soul",
    },
  },
  {
    ...base,
    id: "public-gift",
    mode: "public",
    gift: "1000000",
    reserve: "100000",
    payload: { subject: "Gift", body: "A small light" },
  },
  {
    ...base,
    id: "collected",
    mode: "public",
    gift: "2000000",
    claimed: true,
    payload: { subject: "Delivered", body: "Already collected" },
  },
  {
    ...base,
    id: "sealed-id",
    mode: "link",
    gift: "3000000",
    payload: {
      version: "gd-link-1",
      iv: "private iv",
      ciphertext: "hidden secret subject",
      wrapIv: "",
      wrappedClaimKey: "",
      claimPublicKey: "",
    },
  },
  {
    ...base,
    id: "postbox-id",
    mode: "postbox",
    payload: {
      version: "gd-postbox-1",
      keyVersion: 1,
      recipientKey: "",
      ephemeralPublicKey: "",
      iv: "",
      ciphertext: "hidden addressed contents",
    },
  },
];
describe("public hall discovery", () => {
  it("never includes private-link or addressed mail in any public hall filter", () => {
    for (const filter of ["all", "gifts"] as const)
      expect(
        filterHallMail(letters, filter, "").some((e) => e.mode !== "public"),
      ).toBe(false);
  });
  it("searches public subjects and messages locally with trimmed case-insensitive text", () => {
    expect(
      filterHallMail(letters, "all", "  MOONLIT  ").map((e) => e.id),
    ).toEqual(["public-moon"]);
    expect(
      filterHallMail(letters, "all", "wandering").map((e) => e.id),
    ).toEqual(["public-moon"]);
  });
  it("omits sealed IDs as well as encrypted contents from public search", () => {
    expect(
      filterHallMail(letters, "all", "SEALED-ID").map((e) => e.id),
    ).toEqual([]);
    for (const secret of [
      "hidden secret subject",
      "private iv",
      "hidden addressed contents",
    ])
      expect(filterHallMail(letters, "all", secret)).toEqual([]);
  });
  it("uncollected public gift filtering excludes plain notes, collected gifts and private gifts", () => {
    expect(filterHallMail(letters, "gifts", "").map((e) => e.id)).toEqual([
      "public-gift",
    ]);
  });
  it("combines audience and search without changing source data or order", () => {
    const before = JSON.stringify(letters);
    expect(filterHallMail(letters, "all", "SEALED-ID")).toEqual([]);
    expect(
      filterHallMail(letters, "gifts", "small light").map((e) => e.id),
    ).toEqual(["public-gift"]);
    expect(JSON.stringify(letters)).toBe(before);
  });
});
