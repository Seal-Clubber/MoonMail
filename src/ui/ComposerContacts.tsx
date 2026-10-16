import { useEffect, useRef, useState } from "react";
import type { Envelope, Postbox } from "../core/types";
import type { MailboxPreferences } from "../core/mailbox-state";
import { recipientGroups } from "../core/contacts";
import { SapientSession } from "../core/sapient";
import { useChainMailbox, type MailboxAccess } from "./useChainMailbox";
import { MailboxSaveBar } from "./MailboxSaveBar";
import { PrivateInboxAccess } from "./PrivateInboxAccess";
import { RecipientPicker } from "./RecipientPicker";
export function ComposerContacts({
  box,
  boxes,
  letters,
  access,
  busy,
  onContact,
  onPreferences,
  value,
}: {
  value: string;
  box: Postbox;
  boxes: Postbox[];
  letters: Envelope[];
  access: MailboxAccess;
  busy: boolean;
  onContact: (id: string) => void;
  onPreferences: (id: string, preferences: MailboxPreferences) => void;
}) {
  const [approved, setApproved] = useState(false);
  const session = useRef<object>(null);
  useEffect(() => {
    const token = {};
    session.current = token;
    setApproved(false);
    if (access.wallet instanceof SapientSession)
      void access.wallet
        .hasPostboxViewAccess()
        .then((granted) => {
          if (session.current === token) setApproved(granted);
        })
        .catch(() => {});
    return () => {
      session.current = null;
    };
  }, [access.wallet, access.deployment.network, access.deployment.registry]);
  const state = useChainMailbox(box, { ...access, approved });
  useEffect(() => {
    if (state.loaded) onPreferences(box.id, state.draft);
  }, [box.id, state.loaded, state.draft, onPreferences]);
  const groups = recipientGroups(boxes, letters, box, state.draft.favourites);
  return (
    <div className="composer-contacts">
      <RecipientPicker
        value={value}
        groups={groups}
        busy={busy}
        onChange={onContact}
        favourites={state.draft.favourites}
        onFavourite={state.loaded ? state.favourite : undefined}
        extras={
          <>
            {state.loading && <p role="status">Loading favourites…</p>}
            {state.error && (
              <>
                <p role="alert">{state.error}</p>
                <button
                  type="button"
                  disabled={busy || state.loading}
                  onClick={state.load}
                >
                  Retry loading contacts
                </button>
              </>
            )}
            {!approved && access.wallet instanceof SapientSession && (
              <PrivateInboxAccess
                wallet={access.wallet}
                scope={`${access.deployment.network}:${access.deployment.registry}`}
                setup={false}
                autoPrompt={false}
                busy={busy}
                task={access.task}
                onGranted={() => setApproved(true)}
              />
            )}
          </>
        }
      />
      <MailboxSaveBar state={state} busy={busy} blocked={access.writeBlocked} />
    </div>
  );
}
