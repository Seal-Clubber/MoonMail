import type { Envelope, Letter } from "../core/types";
import { tari } from "./AmountInput";
import { UiIcon } from "./UiIcon";

export function PublicMailCard({
  envelope: e,
  sample,
  onOpen,
}: {
  envelope: Envelope;
  sample?: Letter;
  onOpen: () => void;
}) {
  if (e.mode === "postbox") return null;
  const letter =
    sample ?? (e.mode === "public" ? (e.payload as Letter) : undefined);
  const subject = letter?.subject ?? "A sealed little secret";
  const hasGift = BigInt(e.gift) > 0n;
  return (
    <button
      className={`envelope-card ${e.mode !== "public" ? "sealed" : ""}`}
      onClick={onOpen}
      aria-label={`Open ${sample ? "sample" : e.mode === "public" ? "public letter" : "private invitation"}: ${subject}`}
    >
      <div className="envelope-visual" aria-hidden="true">
        <span className="wax">
          <UiIcon name={e.mode === "public" ? "mail" : "privacy"} />
        </span>
        <span className="stamp">
          MM
          <br />☾
        </span>
      </div>
      <div className="envelope-caption">
        <span className="letter-kind">
          {e.mode === "public" ? "OPEN LETTER" : "PRIVATE INVITATION"}
        </span>
        <h3>{subject}</h3>
        <p className="letter-excerpt">
          {letter
            ? letter.body.replace(/\s+/g, " ").slice(0, 180)
            : "The words inside stay private. You’ll need the sender’s complete private link to open this letter."}
        </p>
        {hasGift && (
          <small
            className={`public-gift-badge ${e.claimed ? "collected" : "available"}`}
          >
            <UiIcon name={e.claimed ? "check" : "gift"} />
            {sample
              ? e.claimed
                ? "Sample gift · collected"
                : `${tari(e.gift)} sample TARI gift`
              : e.claimed
                ? "Collected"
                : e.mode === "public"
                  ? `${tari(e.gift)} TARI gift · available`
                  : "Gift availability recorded on chain"}
          </small>
        )}
      </div>
      <div className="mail-row-meta">
        <span className={`mail-audience audience-${e.mode}`}>
          {e.mode === "public" ? "Public letter" : "Private link"}
        </span>
        <span className="mail-row-reference" title={e.id}>
          {sample ? "Sample" : "Letter"}{" "}
          {e.id.length > 20 ? `${e.id.slice(0, 10)}…${e.id.slice(-6)}` : e.id}
        </span>
        {!hasGift && <span className="mail-row-no-gift">Letter only</span>}
      </div>
      <span className="mail-row-open" aria-hidden="true">
        {e.mode === "public" || sample
          ? "Read letter ↗"
          : "Private link required"}
      </span>
    </button>
  );
}
