import {
  TransactionBuilder,
  Network,
  amountLiteral,
  stringLiteral,
  intLiteral,
  componentAddressLiteral,
  resourceAddressLiteral,
} from "@tari-project/ootle";
import type { Deployment, Envelope } from "./types";
import { assertEnvelopeSize } from "./crypto";
export function money(value: string) {
  if (!/^\d+$/.test(value)) throw new Error("Amounts must be whole microTARI");
  const n = BigInt(value);
  if (n > 18446744073709551615n) throw new Error("Amount exceeds u64");
  return n;
}
export function publishTransaction(
  d: Deployment,
  envelope: Envelope,
  account: string,
  fee: string,
  epoch: number,
) {
  if (envelope.mode === "postbox")
    throw new Error(
      "Addressed publication awaits a verified wallet encryption/recovery provider",
    );
  if (
    d.network !== envelope.context.network ||
    d.registry !== envelope.context.registry ||
    d.template !== envelope.context.template
  )
    throw new Error("Wrong deployment");
  const gift = money(envelope.gift),
    reserve = money(envelope.reserve);
  const total = gift + reserve;
  if (total > 18446744073709551615n || gift > 0n !== reserve > 0n)
    throw new Error("Gift requires its own bounded fee reserve");
  const payload = JSON.stringify(envelope.payload);
  assertEnvelopeSize(envelope);
  return TransactionBuilder.new(d.network as Network, epoch + 10)
    .feeTransactionPayFromComponent(account, money(fee))
    .withInputs(
      [d.template, d.envelopeTemplate].map((id) => ({
        substate_id: `template_${id}`,
        version: null,
        is_write: false,
      })),
    )
    .callMethod({ componentAddress: account, methodName: "withdraw" }, [
      resourceAddressLiteral(d.resource),
      amountLiteral(total),
    ])
    .saveVar("funding")
    .callMethod({ componentAddress: d.registry, methodName: "publish" }, [
      stringLiteral(envelope.id),
      intLiteral(BigInt({ public: 0, link: 1, postbox: 2 }[envelope.mode])),
      stringLiteral(payload),
      intLiteral(gift),
      intLiteral(reserve),
      stringLiteral(
        envelope.mode === "link" && "claimPublicKey" in envelope.payload
          ? envelope.payload.claimPublicKey
          : "",
      ),
      stringLiteral(envelope.recipientPostbox || ""),
      stringLiteral(envelope.replyPostbox || ""),
      stringLiteral(envelope.campaign || ""),
      { Workspace: "funding" },
    ])
    .buildUnsignedTransaction();
}
export function claimTransaction(
  d: Deployment,
  component: string,
  destination: string,
  epoch: number,
) {
  return TransactionBuilder.new(d.network as Network, epoch + 10)
    .addFeeInstruction({
      CallMethod: {
        call: { Address: component },
        method: "claim_and_pay_fee",
        args: [
          componentAddressLiteral(destination),
          intLiteral(BigInt(d.network)),
        ],
      },
    })
    .buildUnsignedTransaction();
}
