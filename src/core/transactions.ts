import {
  TransactionBuilder,
  Network,
  amountLiteral,
  stringLiteral,
  intLiteral,
  componentAddressLiteral,
  resourceAddressLiteral,
  boolLiteral,
} from "@tari-project/ootle";
import type { Deployment, Envelope, Postbox } from "./types";
import { letterLimit } from "./config";
import { assertEnvelopeSize } from "./crypto";
import { postboxNameError } from "./postbox-name";
import { sentCopy } from "./sent-mail";
import { mailboxKey } from "./mailbox";
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
  if (
    envelope.mode === "postbox" &&
    (!envelope.recipientPostbox ||
      !/^[a-f0-9]{64}$/.test(envelope.claimAuthority || "") ||
      !("version" in envelope.payload) ||
      envelope.payload.version !== "gd-postbox-1")
  )
    throw new Error(
      "Addressed mail requires a sealed payload and frozen controller",
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
  sentCopy(envelope);
  const payload = JSON.stringify(envelope.payload);
  assertEnvelopeSize(envelope, letterLimit(d));
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
          : envelope.mode === "postbox"
            ? envelope.claimAuthority!
            : "",
      ),
      stringLiteral(envelope.recipientPostbox || ""),
      stringLiteral(envelope.replyPostbox || ""),
      stringLiteral(envelope.campaign || ""),
      { Workspace: "funding" },
    ])
    .buildUnsignedTransaction();
}
export function postboxTransaction(
  d: Deployment,
  account: string,
  fee: string,
  epoch: number,
  operation: "create" | "edit" | "rotate",
  box: Postbox,
) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(box.id) || !!postboxNameError(box.nickname))
    throw new Error(
      "Choose a postbox ID and a nickname of at most 80 UTF-8 bytes",
    );
  const args =
    operation === "create"
      ? [
          stringLiteral(box.id),
          stringLiteral(box.nickname),
          stringLiteral(JSON.stringify(mailboxKey(box.encryptionKey))),
          boolLiteral(box.discoverable),
        ]
      : operation === "edit"
        ? [
            stringLiteral(box.id),
            stringLiteral(box.nickname),
            boolLiteral(box.discoverable),
          ]
        : [
            stringLiteral(box.id),
            stringLiteral(JSON.stringify(mailboxKey(box.encryptionKey))),
          ];
  return TransactionBuilder.new(d.network as Network, epoch + 10)
    .feeTransactionPayFromComponent(account, money(fee))
    .callMethod(
      {
        componentAddress: d.registry,
        methodName: {
          create: "create_postbox",
          edit: "edit_postbox",
          rotate: "rotate_postbox_key",
        }[operation],
      },
      args,
    )
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
export function claimToNewAccountTransaction(
  d: Deployment,
  component: string,
  ownerPublicKey: string,
  epoch: number,
) {
  if (!/^[a-f0-9]{64}$/.test(ownerPublicKey))
    throw new Error("Invalid receiving account public key");
  return TransactionBuilder.new(d.network as Network, epoch + 10)
    .withFeeInstructionsBuilder((builder) =>
      builder
        .createAccount(ownerPublicKey)
        .saveVar("receiving_account")
        .callMethod(
          { componentAddress: component, methodName: "claim_and_pay_fee" },
          [{ Workspace: "receiving_account" }, intLiteral(BigInt(d.network))],
        ),
    )
    .buildUnsignedTransaction();
}

export function mailboxStateTransaction(
  d: Deployment,
  account: string,
  fee: string,
  epoch: number,
  postbox: string,
  ciphertext: string,
  revision: string,
  component?: string,
) {
  if (
    d.contractProtocol !== "unified-1" ||
    d.template !== d.envelopeTemplate ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(postbox) ||
    !ciphertext ||
    new TextEncoder().encode(ciphertext).length > 98304 ||
    !/^(0|[1-9][0-9]*)$/.test(revision) ||
    money(revision) === 18446744073709551615n ||
    !!component !== (revision !== "0")
  )
    throw new Error("Invalid mailbox state transaction");
  if (component && !/^component_[a-f0-9]{64}$/.test(component))
    throw new Error("Invalid mailbox component");
  return TransactionBuilder.new(d.network as Network, epoch + 10)
    .feeTransactionPayFromComponent(account, money(fee))
    .withInputs([
      { substate_id: `template_${d.template}`, version: null, is_write: false },
      ...(component
        ? [{ substate_id: component, version: null, is_write: true }]
        : []),
    ])
    .callMethod(
      {
        componentAddress: component || d.registry,
        methodName: component ? "set_ciphertext" : "open_mailbox",
      },
      [
        component ? intLiteral(money(revision)) : stringLiteral(postbox),
        stringLiteral(ciphertext),
      ],
    )
    .buildUnsignedTransaction();
}
