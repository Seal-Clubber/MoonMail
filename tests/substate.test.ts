import { expect, test } from "vitest";
import { liveSubstate } from "../src/core/substate";
import resource049 from "./fixtures/ootle-049-resource.json";

const substate = { Component: { body: { state: [38] } } };
const up = { version: 4, state: { up: { substate } }, verified: false };

test("0.47 live state is read without claiming independent proof verification", () => {
  expect(liveSubstate(up)).toBe(substate);
  expect(liveSubstate({ ...up, verified: true })).toBe(substate);
});

test("decodes the 0.49 Esmeralda native-resource CBOR response", () => {
  expect(liveSubstate(resource049)).toHaveProperty("Resource");
  expect(() =>
    liveSubstate({
      ...resource049,
      state: { up: { substate: "not valid base64 CBOR" } },
    }),
  ).toThrow();
});

test.each([
  { ...up, state: { down: {} } },
  { ...up, state: { up: { substate }, down: {} } },
  { ...up, state: { up: {} } },
  { ...up, state: { up: { substate: null } } },
  { ...up, version: -1 },
  { ...up, version: Number.MAX_SAFE_INTEGER + 1 },
  { ...up, verified: undefined },
  { version: 4, substate },
])(
  "unavailable, malformed and obsolete response envelopes are rejected: %j",
  (value) => {
    expect(() => liveSubstate(value)).toThrow();
  },
);
