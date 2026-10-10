import { useEffect, useRef, useState } from "react";
import type { Envelope, Postbox } from "../core/types";
import type { MailboxPreferences } from "../core/mailbox-state";
import { recipientGroups } from "../core/contacts";
import { SapientSession } from "../core/sapient";
import { useChainMailbox, type MailboxAccess } from "./useChainMailbox";
import { MailboxSaveBar } from "./MailboxSaveBar";
import { PrivateInboxAccess } from "./PrivateInboxAccess";
export function ComposerContacts({
  box,
  boxes,
  letters,
  access,
  busy,
  onContact,
  onPreferences,
}: {
  box: Postbox;
  boxes: Postbox[];
  letters: Envelope[];
  access: MailboxAccess;
  busy: boolean;
  onContact: (id: string) => void;
  onPreferences: (id: string, preferences: MailboxPreferences) => void;
}) {
  const [approved, setApproved] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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
      <MailboxSaveBar state={state} busy={busy} blocked={access.writeBlocked} />
      <details
        className="mailbox-contacts"
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary>Contacts & favourite postboxes</summary>
        <p>
          For {box.nickname}: favourites first, past correspondents next, then
          the public directory. Verify IDs with your friends.
        </p>
        {open && !approved && access.wallet instanceof SapientSession && (
          <PrivateInboxAccess
            wallet={access.wallet}
            scope={`${access.deployment.network}:${access.deployment.registry}`}
            setup={false}
            busy={busy}
            task={access.task}
            onGranted={() => setApproved(true)}
          />
        )}
        {state.loading && <p role="status">Loading encrypted contacts…</p>}
        {state.error && (
          <>
            <p role="alert">{state.error}</p>
            <button
              type="button"
              disabled={busy || state.loading}
              onClick={state.load}
            >
              Retry loading mailbox settings
            </button>
          </>
        )}
        <label>
          Find a contact
          <input
            type="search"
            value={query}
            maxLength={160}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h3>{group.label}</h3>
            {group.boxes
              .filter((p) =>
                `${p.nickname} ${p.id}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((p) => (
                <div className="mailbox-contact" key={p.id}>
                  <button
                    type="button"
                    disabled={busy}
                    title={p.id}
                    onClick={() => onContact(p.id)}
                  >
                    {p.nickname}
                    <small>{p.id}</small>
                  </button>
                  {state.loaded && (
                    <button
                      type="button"
                      disabled={busy || state.loading}
                      aria-label={`Favourite ${p.nickname}`}
                      aria-pressed={!!state.draft.favourites?.includes(p.id)}
                      onClick={() => state.favourite(p.id)}
                    >
                      ☆
                    </button>
                  )}
                </div>
              ))}
            {!group.boxes.length && <p>None yet</p>}
          </section>
        ))}
      </details>
    </div>
  );
}
