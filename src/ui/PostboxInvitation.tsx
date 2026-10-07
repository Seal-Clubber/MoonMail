import type { Context, Postbox } from "../core/types";
import type { PostboxRoute } from "../core/postbox-links";
import { sameContext } from "../core/links";

export function PostboxInvitation({
  invitation,
  deployment,
  boxes,
  ready,
  failed,
  busy,
  onAccept,
  onDismiss,
  onRetry,
}: {
  invitation: PostboxRoute;
  deployment: Context;
  boxes: Postbox[];
  ready: boolean;
  failed: boolean;
  busy: boolean;
  onAccept: (id: string) => void;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const matching = sameContext(invitation.context, deployment);
  const box =
    matching && ready ? boxes.find((p) => p.id === invitation.id) : undefined;
  return (
    <section
      className="info postbox-invitation"
      aria-label="Postbox invitation"
    >
      <p className="eyebrow">An address from the other side</p>
      <h2>
        {box ? `Write to ${box.nickname}` : "A friend left you a postbox."}
      </h2>
      <p>
        {!deployment.registry
          ? "Loading the selected post office. If this continues, reload the page to retrieve its settings."
          : !matching
            ? "This invitation belongs to a different post office or network. Ask your friend for a link to this office, or review your settings. Nothing has been switched automatically."
            : failed
              ? "The post office could not be reached. Refresh to verify this invitation before writing."
              : !ready
                ? "Checking this postbox in the selected post office…"
                : !box
                  ? "This postbox is not registered in the selected office. Check the complete link with your friend."
                  : "This registered postbox receives private letters. Check its full ID with your friend; names can repeat. Opening this invitation does not unlock their inbox or send anything."}
      </p>
      <p className="fine-print">
        Postbox ID <code>{invitation.id}</code>
      </p>
      <div className="actions">
        <button
          className="primary"
          disabled={busy || !box}
          onClick={() => box && onAccept(box.id)}
        >
          Use this postbox for my letter
        </button>
        {matching && (failed || (ready && !box)) && (
          <button disabled={busy} onClick={onRetry}>
            Refresh invitation
          </button>
        )}
        <button disabled={busy} onClick={onDismiss}>
          Dismiss invitation
        </button>
      </div>
      <p className="fine-print">
        Choosing this recipient keeps your current subject and message. Writing
        needs Sapient only when you publish.
      </p>
    </section>
  );
}
