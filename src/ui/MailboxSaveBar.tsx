import { FeeAdjustment } from "./FeeAdjustment";
import { validFee } from "../core/fee-limit";
import type { useChainMailbox } from "./useChainMailbox";
export function MailboxSaveBar({
  state,
  busy,
  blocked,
}: {
  state: ReturnType<typeof useChainMailbox>;
  busy: boolean;
  blocked?: boolean;
}) {
  if (!state.dirty) return null;
  return (
    <div className="mailbox-save-bar" aria-label="Unsaved mailbox changes">
      <div role="status">
        <strong>Unsaved mailbox changes</strong>
        <p>
          Save to Ootle to keep read status, archive, favourites and layout on
          another device. Reloading loses unsaved changes.
        </p>
      </div>
      <div className="mailbox-save-actions">
        <button
          className="primary"
          disabled={busy || state.loading || blocked || !validFee(state.fee)}
          onClick={state.save}
        >
          Save mailbox changes
        </button>
        <button disabled={busy || state.loading} onClick={state.discard}>
          Discard unsaved changes
        </button>
        <FeeAdjustment
          label="Mailbox save fee limit"
          problem={state.feeProblem}
          value={state.fee}
          busy={busy}
          onChange={state.setFee}
        />
      </div>
    </div>
  );
}
