import { AmountInput } from "./AmountInput";
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
          disabled={busy || state.loading || blocked}
          onClick={state.save}
        >
          Save mailbox changes
        </button>
        <button disabled={busy || state.loading} onClick={state.discard}>
          Discard unsaved changes
        </button>
        <details>
          <summary>Transaction fee limit</summary>
          <AmountInput
            label="Mailbox save fee cap"
            value={state.fee}
            disabled={busy}
            onChange={state.setFee}
          />
          <p>
            Saving requests one transaction approval in Sapient. Opening letters
            sends no transaction.
          </p>
        </details>
      </div>
    </div>
  );
}
