import type { PostOfficeClient } from "./chain";
import type { Pending } from "./pending";

// Receipt checking cannot sign, resume a wallet request or submit a transaction.
export async function readDelivery(
  reader: Pick<PostOfficeClient, "reconcile">,
  pending: Pending,
): Promise<Pending> {
  if (!/^[a-f0-9]{64}$/.test(pending.id))
    throw new Error(
      "This submission has no transaction ID. Inspect Sapient history before retrying.",
    );
  if (pending.state === "confirmed" || pending.state === "rejected")
    return pending;
  const outcome = await reader.reconcile(pending.id);
  if (!outcome) return pending;
  return {
    ...pending,
    state:
      outcome.outcome === "Commit"
        ? "confirmed"
        : outcome.outcome === "FeeIntentCommit"
          ? "unknown"
          : "rejected",
  };
}
