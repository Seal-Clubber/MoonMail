import type { MailboxContext, MailboxKey, CapsuleDeployment } from "./types";
import { mailboxAAD, mailboxKey } from "./mailbox";
export interface CapsuleRecord {
  account: string;
  context: MailboxContext;
  descriptor: MailboxKey;
  deployment?: CapsuleDeployment;
}
export interface Pending {
  id: string;
  network: number;
  registry: string;
  operation: "publish" | "claim" | "postbox" | "capsule";
  envelopeId: string;
  state: "submitted" | "confirmed" | "rejected" | "unknown";
  capsule?: CapsuleRecord;
  walletRequest?: { provider: "sapient"; id: string; account: string };
}
export function capsuleIdentity(context: MailboxContext) {
  return `capsule:${context.postbox}:${context.keyVersion}`;
}
export function validCapsule(
  p: Pick<
    Pending,
    "operation" | "capsule" | "network" | "registry" | "envelopeId"
  >,
) {
  if (p.operation !== "capsule") return p.capsule === undefined;
  const c = p.capsule;
  if (!c || !/^component_[a-f0-9]{64}$/.test(c.account)) return false;
  mailboxAAD(c.context, "key-capsule", "00".repeat(32), "00".repeat(32));
  const descriptor = mailboxKey(c.descriptor);
  return (
    ((descriptor.recovery === "native-memo-1" && c.deployment === undefined) ||
      (descriptor.recovery === "sapient-capsule-1" &&
        c.deployment &&
        /^[a-f0-9]{64}$/.test(c.deployment.template) &&
        /^component_[a-f0-9]{64}$/.test(c.deployment.component) &&
        c.deployment.resource === descriptor.capsule?.resource)) &&
    descriptor.keyVersion === c.context.keyVersion &&
    c.context.network === p.network &&
    c.context.registry === p.registry &&
    p.envelopeId === capsuleIdentity(c.context)
  );
}
const key = "ghostdrop:pending:v1";
function strictPending(storage: Pick<Storage, "getItem">): Pending[] {
  try {
    const data: unknown = JSON.parse(storage.getItem(key) || "[]");
    if (
      !Array.isArray(data) ||
      data.some(
        (p) =>
          !p ||
          typeof p.id !== "string" ||
          typeof p.envelopeId !== "string" ||
          typeof p.registry !== "string" ||
          !Number.isInteger(p.network) ||
          !["publish", "claim", "postbox", "capsule"].includes(p.operation) ||
          !validCapsule(p) ||
          (p.walletRequest !== undefined &&
            (!(
              ["publish", "postbox"].includes(p.operation) ||
              (p.operation === "capsule" &&
                p.capsule?.descriptor.recovery === "sapient-capsule-1" &&
                p.walletRequest.account === p.capsule.account)
            ) ||
              p.walletRequest.provider !== "sapient" ||
              typeof p.walletRequest.id !== "string" ||
              !/^[A-Za-z0-9_-]{1,128}$/.test(p.walletRequest.id) ||
              !/^component_[a-f0-9]{64}$/.test(p.walletRequest.account))) ||
          !["submitted", "confirmed", "rejected", "unknown"].includes(p.state),
      )
    )
      throw new Error("Invalid journal");
    return data;
  } catch {
    throw new Error(
      "Pending journal cannot be read. Reconcile chain and account history before recovering local storage; spending is blocked.",
    );
  }
}
export function readPending(storage: Pick<Storage, "getItem">): Pending[] {
  try {
    return strictPending(storage);
  } catch {
    return [];
  }
}
export function savePending(
  storage: Pick<Storage, "getItem" | "setItem">,
  p: Pending,
) {
  const all = strictPending(storage);
  storage.setItem(
    key,
    JSON.stringify([...all.filter((x) => x.id !== p.id), p]),
  );
}
export function hasUnresolved(
  storage: Pick<Storage, "getItem">,
  network: number,
  registry: string,
  envelopeId: string,
) {
  return strictPending(storage).some(
    (p) =>
      p.network === network &&
      p.registry === registry &&
      p.envelopeId === envelopeId &&
      ["submitted", "unknown"].includes(p.state),
  );
}
// Persist before crossing the network boundary. A lost HTTP response is uncertain,
// even when no transaction ID came back. Keep this record until chain reconciliation.
export function beginSubmission(
  storage: Pick<Storage, "getItem" | "setItem">,
  p: Omit<Pending, "id" | "state">,
) {
  const id = `attempt:${crypto.randomUUID()}`;
  savePending(storage, { ...p, id, state: "unknown" });
  return id;
}
export function completeSubmission(
  storage: Pick<Storage, "getItem" | "setItem">,
  attempt: string,
  transactionId: string,
) {
  const all = strictPending(storage),
    p = all.find((x) => x.id === attempt);
  if (!p) throw new Error("Submission journal missing");
  storage.setItem(
    key,
    JSON.stringify([
      ...all.filter((x) => x.id !== attempt),
      { ...p, id: transactionId, state: "submitted" },
    ]),
  );
}
