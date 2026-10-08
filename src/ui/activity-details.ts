import type { Pending } from "../core/pending";
import { pendingIsUnresolved } from "../core/pending";

export type ActivityFilter = "all" | "pending" | "confirmed" | "rejected";
export function activityDetails(p: Pending) {
  const hasReceipt = /^[a-f0-9]{64}$/.test(p.id);
  const unresolved = pendingIsUnresolved(p);
  const title =
    p.operation === "publish"
      ? "Send a letter"
      : p.operation === "claim"
        ? "Collect a gift"
        : p.operation === "capsule"
          ? "Save a recovery backup"
          : p.postboxAction === "create"
            ? "Open a postbox"
            : p.postboxAction === "rotate"
              ? "Update a postbox encryption key"
              : p.postboxAction === "edit"
                ? "Edit a postbox"
                : "Change a postbox";
  const subject =
    p.operation === "publish"
      ? "your letter"
      : p.operation === "claim"
        ? "this gift collection"
        : p.operation === "capsule"
          ? "the encrypted recovery backup"
          : "the postbox change";
  let explanation: string, nextStep: string;
  if (p.state === "rejected") {
    explanation = `The transaction for ${subject} did not complete. This record does not promise that no fees were paid.`;
    nextStep =
      "Check Sapient transaction history for the reason and any fees before preparing another attempt.";
  } else if (!unresolved) {
    explanation =
      p.operation === "publish"
        ? "Your letter was confirmed at this post office. This does not mean anyone has read it."
        : p.operation === "claim"
          ? "The original collection transaction was confirmed. Inspect your receiving account to see its payout."
          : p.operation === "capsule"
            ? "The encrypted recovery backup was confirmed. This is the first approval, not the finished postbox."
            : "The postbox transaction was confirmed. Your inbox shows the current postbox settings.";
    nextStep =
      p.operation === "capsule"
        ? "Return to My inbox and resume setup for the second approval. If you already completed it, no further approval is needed."
        : p.operation === "postbox"
          ? "Open My inbox to check the postbox."
          : p.operation === "claim"
            ? "Keep the original receipt if you need to check the receiving account history."
            : "Share a public letter link, or use the private link you saved before sending.";
  } else if (!hasReceipt) {
    explanation =
      p.operation === "claim"
        ? "No transaction receipt identifies your payout. A collected gift alone cannot prove that your receiving account was paid."
        : `GhostDrop saved the original attempt for ${subject}, but has not received its transaction ID. The action may already have reached the wallet or network.`;
    nextStep = p.walletRequest
      ? "Resume the same saved Sapient approval if available, then check its original receipt. Do not send a replacement."
      : "Inspect the receiving account or Sapient transaction history. Do not send a replacement while this outcome is unresolved.";
  } else if (p.state === "unknown") {
    explanation = `The outcome of ${subject} is unclear. Fees may have been paid even if the main action did not finish.`;
    nextStep =
      "Check the original transaction below and compare it with Sapient history. Do not send a replacement.";
  } else {
    explanation = `The transaction for ${subject} has been submitted and is waiting for a final receipt.`;
    nextStep =
      "Use Check status to read the original receipt. This does not send another transaction or request a signature.";
  }
  return {
    title,
    explanation,
    nextStep,
    hasReceipt,
    unresolved,
    label:
      !unresolved && p.state === "confirmed"
        ? "Delivered"
        : p.state === "rejected"
          ? "Not completed"
          : "Awaiting confirmation",
    tone:
      p.state === "rejected"
        ? "rejected"
        : !unresolved
          ? "confirmed"
          : p.state === "unknown" || !hasReceipt
            ? "review"
            : "pending",
    entityLabel:
      p.operation === "capsule" || p.operation === "postbox"
        ? "Postbox ID"
        : "Letter ID",
    entity:
      p.capsule?.context.postbox ||
      p.envelopeId
        .replace(/^postbox:/, "")
        .replace(/^capsule:/, "")
        .replace(/:\d+$/, ""),
  };
}
export function activityMatches(p: Pending, filter: ActivityFilter) {
  if (filter === "all") return true;
  if (filter === "pending") return pendingIsUnresolved(p);
  if (filter === "confirmed")
    return p.state === "confirmed" && !pendingIsUnresolved(p);
  return p.state === "rejected";
}
export function newestActivity(records: Pending[]) {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
      if (a.record.createdAt !== undefined && b.record.createdAt !== undefined)
        return b.record.createdAt - a.record.createdAt || b.index - a.index;
      if (a.record.createdAt !== undefined) return -1;
      if (b.record.createdAt !== undefined) return 1;
      return b.index - a.index;
    })
    .map(({ record }) => record);
}
