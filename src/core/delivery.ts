import type { PostOfficeClient } from "./chain";
import type { Pending } from "./pending";

// Receipt checking cannot sign, resume a wallet request or submit a transaction.
export async function readDelivery(
  reader: Pick<PostOfficeClient, "reconcile"> &
    Partial<Pick<PostOfficeClient, "readLetter">>,
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
  if (pending.sealedBinding && outcome.outcome === "Commit") {
    if (!reader.readLetter)
      throw new Error(
        "Read the original sealed letter before confirming this submission",
      );
    const { verifySealedPublication } = await import("./sealed-view");
    await verifySealedPublication(
      pending,
      await reader.readLetter(pending.envelopeId),
    );
  }
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
