import { expect, test } from "vitest";
import { liveSubstate } from "../src/core/substate";

const substate = { Component: { body: { state: [38] } } };
const up = { version: 4, state: { up: { substate } }, verified: false };

test("0.47 live state is read without claiming independent proof verification", () => {
  expect(liveSubstate(up)).toBe(substate);
  expect(liveSubstate({ ...up, verified: true })).toBe(substate);
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
