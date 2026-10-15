import { parseOotleAddress } from "@tari-project/ootle-wasm";
import { hex } from "./crypto";
import type { Context } from "./types";
import type { RecoveredSealedMail } from "./sealed-mail";

export const privateTari = `resource_${"01".repeat(32)}`;
interface PaymentBase {
  version: "mm-payment-1";
  nonce: string;
  resource: string;
  amount: string;
  destination: string;
}
export interface PaymentRequest extends PaymentBase {
  kind: "request";
}
export interface PaymentIntent extends PaymentBase {
  kind: "intent";
  requestLetter: string;
  walletRequest: string;
  feeCap: string;
}
export interface PaymentReceipt extends PaymentBase {
  kind: "receipt";
  requestLetter: string;
  intentLetter: string;
  transactionId: string;
  commitment: string;
}
export type PrivatePayment = PaymentRequest | PaymentIntent | PaymentReceipt;
export function paymentHex(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{64}$/.test(value) ||
    /^0+$/.test(value)
  )
    throw new Error("Invalid private payment identifier");
}
export function paymentAmount(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !/[1-9]/.test(value) ||
    !/^[1-9][0-9]{0,19}$/.test(value) ||
    BigInt(value) > 18446744073709551615n
  )
    throw new Error("Enter a positive whole microTARI payment amount");
}
export function paymentAddress(
  value: unknown,
  network: number,
  owner?: string,
) {
  if (typeof value !== "string" || value.length > 256)
    throw new Error("Invalid private receiving address");
  const parsed = parseOotleAddress(value);
  try {
    if (
      parsed.network !== network ||
      parsed.memo?.length ||
      (owner && hex(parsed.owner_key) !== owner)
    )
      throw new Error(
        "Receiving address does not match the authenticated wallet and network",
      );
  } finally {
    parsed.free();
  }
  return value;
}
export function parsePrivatePayment(
  value: unknown,
  network: number,
  author: string,
): PrivatePayment {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid private payment");
  const p = value as Record<string, unknown>,
    base = ["version", "kind", "nonce", "resource", "amount", "destination"];
  const extra =
    p.kind === "request"
      ? []
      : p.kind === "intent"
        ? ["requestLetter", "walletRequest", "feeCap"]
        : p.kind === "receipt"
          ? ["requestLetter", "intentLetter", "transactionId", "commitment"]
          : undefined;
  if (
    !extra ||
    p.version !== "mm-payment-1" ||
    Object.keys(p).length !== base.length + extra.length ||
    [...base, ...extra].some((k) => !Object.hasOwn(p, k)) ||
    p.resource !== privateTari
  )
    throw new Error("Unsupported private payment fields or asset");
  paymentHex(p.nonce);
  paymentAmount(p.amount);
  paymentAddress(
    p.destination,
    network,
    p.kind === "request" ? author : undefined,
  );
  if (p.kind !== "request") paymentHex(p.requestLetter);
  if (p.kind === "intent") {
    if (
      typeof p.walletRequest !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(p.walletRequest)
    )
      throw new Error("Invalid original wallet request");
    paymentAmount(p.feeCap);
  }
  if (p.kind === "receipt")
    for (const k of ["intentLetter", "transactionId", "commitment"])
      paymentHex(p[k]);
  return structuredClone(value) as PrivatePayment;
}
export async function paymentLetterId(
  context: Context,
  requestLetter: string,
  request: PaymentRequest,
  payer: string,
  phase: "intent" | "receipt",
) {
  paymentHex(requestLetter);
  paymentHex(payer);
  paymentHex(context.template);
  paymentHex(request.nonce);
  if (
    ![16, 36, 38].includes(context.network) ||
    !/^component_[a-f0-9]{64}$/.test(context.registry)
  )
    throw new Error("Invalid payment office");
  return hex(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify([
            "MoonMail",
            "mm-payment-1",
            phase,
            context.network,
            context.registry,
            context.template,
            requestLetter,
            request.nonce,
            payer,
          ]),
        ),
      ),
    ),
  );
}
export const paymentMemo = (intentId: string) => {
  paymentHex(intentId);
  return `mm-payment-1:${intentId}`;
};
export function samePayment(a: PrivatePayment, b: PrivatePayment) {
  return (
    a.nonce === b.nonce &&
    a.resource === b.resource &&
    a.amount === b.amount &&
    a.destination === b.destination
  );
}
export function paymentOutputId(receipt: PaymentReceipt) {
  return `utxo_${receipt.resource.slice("resource_".length)}_${receipt.commitment}`;
}
// A claimed receipt must identify an output actually created by a committed tx.
// Reading the output alone would let an unrelated transaction masquerade as payment.
export function verifyPaymentOutput(receipt: PaymentReceipt, result: unknown) {
  const r = result as {
    result?: {
      Finalized?: {
        final_decision?: string;
        execution_result?: {
          finalize?: { result?: { Accept?: { up_substates?: unknown[] } } };
        };
      };
    };
  };
  const finalized = r?.result?.Finalized,
    up = finalized?.execution_result?.finalize?.result?.Accept?.up_substates;
  const output = Array.isArray(up)
    ? up.filter(
        (e: any) =>
          Array.isArray(e) &&
          e.length === 2 &&
          e[0] === paymentOutputId(receipt),
      )
    : [];
  if (
    finalized?.final_decision !== "Commit" ||
    output.length !== 1 ||
    !(output[0] as any)[1]?.substate?.Utxo
  )
    throw new Error(
      "The private payment output is not in this committed transaction",
    );
}
// Indexers can prune transaction history while the unspent output remains.
// This proves current committed output existence, not its claimed tx reference.
// The receiver must still verify the amount/memo/ownership through Sapient.
export function verifyLivePaymentOutput(result: unknown) {
  const r = result as {
    substate?: { Utxo?: { is_frozen?: boolean; output?: unknown } };
  };
  if (
    r?.substate?.Utxo?.is_frozen !== false ||
    !r.substate.Utxo.output ||
    typeof r.substate.Utxo.output !== "object"
  )
    throw new Error("The private payment output is unavailable or frozen");
}
export async function verifyReceivedPayment(
  context: Context,
  receiptEntry: RecoveredSealedMail,
  requestEntry: RecoveredSealedMail,
  intentEntry: RecoveredSealedMail,
  recipientController: string,
  payerController: string,
) {
  const request = requestEntry.message.letter.privatePayment,
    intent = intentEntry.message.letter.privatePayment,
    receipt = receiptEntry.message.letter.privatePayment;
  if (
    request?.kind !== "request" ||
    intent?.kind !== "intent" ||
    receipt?.kind !== "receipt" ||
    !requestEntry.sent ||
    !receiptEntry.inbox ||
    !intentEntry.inbox ||
    requestEntry.message.sender.controller !== recipientController ||
    intentEntry.message.sender.controller !== payerController ||
    receiptEntry.message.sender.controller !== payerController
  )
    throw new Error("Payment records do not authenticate both participants");
  parsePrivatePayment(request, context.network, recipientController);
  const intentId = await paymentLetterId(
      context,
      requestEntry.id,
      request,
      payerController,
      "intent",
    ),
    receiptId = await paymentLetterId(
      context,
      requestEntry.id,
      request,
      payerController,
      "receipt",
    );
  if (
    intentEntry.id !== intentId ||
    receiptEntry.id !== receiptId ||
    intent.requestLetter !== requestEntry.id ||
    receipt.requestLetter !== requestEntry.id ||
    receipt.intentLetter !== intentId ||
    !samePayment(request, intent) ||
    !samePayment(request, receipt) ||
    [intentEntry, receiptEntry].some(
      (e) =>
        e.message.sender.postbox !== requestEntry.message.recipient.postbox ||
        e.message.recipient.postbox !== requestEntry.message.sender.postbox ||
        e.message.letter.thread?.parent !== requestEntry.id,
    )
  )
    throw new Error(
      "Receipt does not match the encrypted payment request and recovery intent",
    );
  return structuredClone(receipt);
}
