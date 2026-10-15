import { FeeLimitError } from "./fee-limit";
import type { Context } from "./types";
import type { RecoveredSealedMail } from "./sealed-mail";
import {
  paymentAddress,
  paymentAmount,
  paymentHex,
  paymentLetterId,
  samePayment,
  parsePrivatePayment,
  type PaymentRequest,
  type PaymentIntent,
  type PaymentReceipt,
} from "./private-payment";
import { hex } from "./crypto";

export interface PrivatePaymentFlowPort {
  context: Context;
  payer: string;
  account: string;
  postbox: string;
  storage: Storage;
  assertCurrent(): Promise<void>;
  // Undefined means the directory positively excluded this ID. An occupied,
  // unreadable or malformed record must throw rather than look like absence.
  read(id: string): Promise<RecoveredSealedMail | undefined>;
  publish(
    id: string,
    payment: PaymentIntent | PaymentReceipt,
    request: RecoveredSealedMail,
  ): Promise<string>;
  confirmed(transactionId: string): Promise<void>;
  verifyReceipt(receipt: PaymentReceipt): Promise<void>;
  create(
    request: PaymentRequest,
    intentId: string,
    feeCap: string,
  ): Promise<string>;
  inspect(
    requestId: string,
  ): Promise<{ requestId: string; status: string; result?: unknown }>;
  submit(requestId: string): Promise<unknown>;
  status(message: string): void;
  pause?(): Promise<void>;
}
interface Attempt {
  scope: string;
  operationHash: string;
  walletRequest?: string;
}
const journalKey = "moonmail:private-payment-attempts:v1";
function attempts(storage: Storage): Attempt[] {
  const values: unknown = JSON.parse(storage.getItem(journalKey) ?? "[]");
  if (
    !Array.isArray(values) ||
    values.length > 512 ||
    values.some(
      (a: any) =>
        !a ||
        typeof a !== "object" ||
        Object.keys(a).some(
          (k) => !["scope", "operationHash", "walletRequest"].includes(k),
        ) ||
        typeof a.scope !== "string" ||
        !/^([a-f0-9]{64})$/.test(a.operationHash) ||
        (a.walletRequest !== undefined &&
          (typeof a.walletRequest !== "string" ||
            !/^[A-Za-z0-9_-]{1,128}$/.test(a.walletRequest))),
    ) ||
    new Set(values.map((a: any) => a.scope)).size !== values.length
  )
    throw new Error(
      "Payment recovery journal is damaged. Do not create a replacement payment.",
    );
  return values as Attempt[];
}
function save(storage: Storage, attempt: Attempt) {
  const all = attempts(storage).filter((a) => a.scope !== attempt.scope);
  if (all.length >= 512)
    throw new Error(
      "Keep existing payment recovery records; journal capacity reached",
    );
  const value = JSON.stringify([...all, attempt]);
  storage.setItem(journalKey, value);
  if (storage.getItem(journalKey) !== value)
    throw new Error(
      "Payment recovery cannot be saved in this browser; nothing new may be requested",
    );
}
function result(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "Original private payment result is unavailable; do not pay again",
    );
  const r = value as Record<string, unknown>;
  paymentHex(r.transactionId);
  paymentHex(r.recipientCommitment);
  if (
    r.minimumValuePromise !== undefined &&
    r.minimumValuePromise !== "0" &&
    r.minimumValuePromise !== 0
  )
    throw new Error("Payment result exposed a nonzero value promise");
  return { transactionId: r.transactionId, commitment: r.recipientCommitment };
}
function requestFor(port: PrivatePaymentFlowPort, source: RecoveredSealedMail) {
  const request = source.message.letter.privatePayment;
  if (
    !source.inbox ||
    request?.kind !== "request" ||
    source.message.recipient.postbox !== port.postbox
  )
    throw new Error(
      "Open a private payment request addressed to your selected postbox",
    );
  parsePrivatePayment(
    request,
    port.context.network,
    source.message.sender.controller,
  );
  if (!/^component_[a-f0-9]{64}$/.test(port.account))
    throw new Error("Invalid connected payment account");
  paymentAddress(
    request.destination,
    port.context.network,
    source.message.sender.controller,
  );
  paymentAmount(request.amount);
  paymentHex(request.nonce);
  paymentHex(source.id);
  paymentHex(port.payer);
  return structuredClone(request);
}
function recordFor(
  port: PrivatePaymentFlowPort,
  entry: RecoveredSealedMail,
  source: RecoveredSealedMail,
  id: string,
) {
  if (
    entry.id !== id ||
    !entry.sent ||
    entry.message.sender.controller !== port.payer ||
    entry.message.sender.postbox !== port.postbox ||
    entry.message.recipient.postbox !== source.message.sender.postbox ||
    entry.message.letter.thread?.parent !== source.id
  )
    throw new Error(
      "Stored payment record belongs to another participant or request",
    );
  return entry.message.letter.privatePayment;
}
// Three approvals: authorize native spend, publish encrypted recovery intent,
// publish encrypted receipt. Only the original request may be submitted, and
// only after its unique intent is confirmed. Never replace a failed/unknown one.
export async function payPrivateRequest(
  port: PrivatePaymentFlowPort,
  source: RecoveredSealedMail,
  feeCap: string,
) {
  await port.assertCurrent();
  const request = requestFor(port, source);
  const intentId = await paymentLetterId(
      port.context,
      source.id,
      request,
      port.payer,
      "intent",
    ),
    receiptId = await paymentLetterId(
      port.context,
      source.id,
      request,
      port.payer,
      "receipt",
    );
  let intent: PaymentIntent;
  const existing = await port.read(intentId);
  if (existing) {
    const p = recordFor(port, existing, source, intentId);
    if (
      p?.kind !== "intent" ||
      p.requestLetter !== source.id ||
      !samePayment(p, request)
    )
      throw new Error(
        "Original encrypted payment intent does not match this request",
      );
    intent = p;
  } else {
    paymentAmount(feeCap);
    const scope = JSON.stringify([
      port.context.network,
      port.context.registry,
      port.context.template,
      port.account,
      intentId,
    ]);
    const operationHash = hex(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify([request, intentId, feeCap])),
        ),
      ),
    );
    let local = attempts(port.storage).find((a) => a.scope === scope);
    if (local && local.operationHash !== operationHash)
      throw new Error(
        "Resume the original payment amount, address and fee cap",
      );
    if (!local) {
      local = { scope, operationHash };
      save(port.storage, local);
      port.status(
        "1 of 3 · Approve the private payment in Sapient. It is not submitted yet.",
      );
      const walletRequest = await port.create(request, intentId, feeCap);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(walletRequest))
        throw new Error(
          "Original wallet approval identity was lost; do not create another",
        );
      local.walletRequest = walletRequest;
      save(port.storage, local);
    }
    if (!local.walletRequest)
      throw new Error(
        "The original wallet request response was lost. Inspect the original Sapient installation; this request cannot be replaced safely.",
      );
    await approval(port, local.walletRequest, false);
    await port.assertCurrent();
    intent = {
      ...request,
      kind: "intent",
      requestLetter: source.id,
      walletRequest: local.walletRequest,
      feeCap,
    };
    port.status(
      "2 of 3 · Save the encrypted recovery record on Ootle. Only postage is spent in this approval.",
    );
    const transactionId = await port.publish(intentId, intent, source);
    await port.confirmed(transactionId);
  }
  // Re-read the confirmed unique record. A competing tab/device may have won;
  // an unbound approval from the losing tab must never be submitted.
  await port.assertCurrent();
  const stored = await port.read(intentId);
  if (!stored)
    throw new Error(
      "The recovery intent is not confirmed; payment was not submitted by MoonMail",
    );
  const recorded = recordFor(port, stored, source, intentId);
  if (
    recorded?.kind !== "intent" ||
    !samePayment(recorded, intent) ||
    recorded.requestLetter !== intent.requestLetter ||
    recorded.walletRequest !== intent.walletRequest ||
    recorded.feeCap !== intent.feeCap
  )
    throw new Error(
      "Another original approval owns this payment intent. Resume its recovery record; do not submit this approval.",
    );
  const completed = await port.read(receiptId);
  if (completed) {
    const p = recordFor(port, completed, source, receiptId);
    if (
      p?.kind !== "receipt" ||
      p.requestLetter !== source.id ||
      p.intentLetter !== intentId ||
      !samePayment(p, request)
    )
      throw new Error("Stored receipt does not match the original payment");
    await port.verifyReceipt(p);
    return { receipt: p, receiptId, alreadyDelivered: true };
  }
  port.status(
    "Sending the original private payment. A reload resumes this same Sapient approval.",
  );
  if (intent.feeCap !== feeCap)
    throw new FeeLimitError("private-payment", "restore", intent.feeCap);
  const native = await approval(port, intent.walletRequest, true),
    out = result(native);
  await port.assertCurrent();
  const receipt: PaymentReceipt = {
    ...request,
    kind: "receipt",
    requestLetter: source.id,
    intentLetter: intentId,
    ...out,
  };
  await port.verifyReceipt(receipt);
  port.status(
    "3 of 3 · Deliver the encrypted payment receipt. The payment has already been sent; this approval spends postage only.",
  );
  const transactionId = await port.publish(receiptId, receipt, source);
  await port.confirmed(transactionId);
  await port.assertCurrent();
  return { receipt, receiptId, alreadyDelivered: false };
}
async function approval(
  port: PrivatePaymentFlowPort,
  requestId: string,
  submit: boolean,
) {
  const end = Date.now() + 120000;
  do {
    await port.assertCurrent();
    const record = await port.inspect(requestId);
    if (record.requestId !== requestId)
      throw new Error("Wallet returned a different original payment request");
    if (record.status === "submitted") return record.result;
    if (record.status === "approved")
      return submit ? port.submit(requestId) : undefined;
    if (record.status === "failed" || record.status === "rejected")
      throw new Error(
        "The original payment request failed or was rejected. Reconcile it in Sapient; MoonMail will not create a replacement.",
      );
    if (record.status !== "pending" && record.status !== "submitting")
      throw new Error("Unknown private payment request status");
    if (Date.now() >= end) break;
    await (port.pause?.() ?? new Promise((r) => setTimeout(r, 700)));
  } while (true);
  throw new Error(
    "Original payment approval is still pending. Resume it without paying again.",
  );
}
