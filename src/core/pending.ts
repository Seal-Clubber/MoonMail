export interface Pending {
  id: string;
  network: number;
  registry: string;
  operation: "publish" | "claim";
  envelopeId: string;
  state: "submitted" | "confirmed" | "rejected" | "unknown";
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
          !["publish", "claim"].includes(p.operation) ||
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
