import { expect, test } from "vitest";
import { publishTransaction } from "../src/core/transactions";
import { emptyDeployment } from "../src/core/config";

test("a unified office declares its shared publication template exactly once", () => {
  const deployment = {
    ...emptyDeployment,
    network: 38,
    registry: `component_${"3".repeat(64)}`,
    template: "1".repeat(64),
    envelopeTemplate: "1".repeat(64),
    contractProtocol: "unified-2" as const,
    resource: `resource_${"01".repeat(32)}`,
  };
  const transaction = publishTransaction(
    deployment,
    {
      id: "publication-fixture",
      mode: "public",
      context: deployment,
      payload: { subject: "Hello", body: "Public test letter" },
      gift: "0",
      reserve: "0",
      claimed: false,
      sender: "4".repeat(64),
    },
    `component_${"2".repeat(64)}`,
    "100000",
    100,
  );
  const templates = transaction.inputs.filter((input) =>
    input.substate_id.startsWith("template_"),
  );
  expect(templates).toEqual([
    {
      substate_id: `template_${deployment.template}`,
      version: null,
      is_write: false,
    },
  ]);
});
