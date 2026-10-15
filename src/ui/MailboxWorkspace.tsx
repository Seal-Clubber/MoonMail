import { useEffect, useRef, useState } from "react";
import type { Envelope, Letter, Postbox } from "../core/types";
import { useChainMailbox, type MailboxAccess } from "./useChainMailbox";
import { hasSentCopy } from "../core/sent-mail";
import { PrivatePaymentCard } from "./PrivatePaymentCard";
import { conversation } from "../core/threads";
import { MailboxSaveBar } from "./MailboxSaveBar";
import {
  READ,
  STAR,
  ARCHIVE,
  type MailboxPreferences,
} from "../core/mailbox-state";
import { tari } from "./AmountInput";
import type { ReactNode } from "react";
import { MoonlitScene, UiIcon, type IconName } from "./UiIcon";

// Every folder is a view of loaded on-chain state, not a device-only mailbox record.
type Folder =
  | "inbox"
  | "gifts"
  | "collected"
  | "sent"
  | "starred"
  | "archive"
  | "unread";
const folders: { id: Folder; label: string; icon: IconName }[] = [
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "sent", label: "Sent", icon: "sent" },
  { id: "gifts", label: "Available gifts", icon: "gift" },
  { id: "collected", label: "Collected gifts", icon: "check" },
];
export function MailboxWorkspace({
  box,
  letters,
  plain,
  sentPlain,
  onOpenSent,
  activeId,
  busy,
  canUnlock,
  onOpen,
  onClose,
  onCompose,
  onUnlock,
  onReaderTarget,
  stateAccess,
  boxes,
  onReply,
  onPreferences,
  postboxPicker,
  postboxActions,
  onPublic,
  onPrivacy,
}: {
  postboxPicker: ReactNode;
  postboxActions: ReactNode;
  onPublic: () => void;
  onPrivacy: () => void;
  stateAccess?: MailboxAccess;
  boxes: Postbox[];
  onReply: (e: Envelope, letter: Letter) => void;
  onPreferences: (id: string, p: MailboxPreferences) => void;
  box: Postbox;
  letters: Envelope[];
  plain: ReadonlyMap<string, Letter>;
  sentPlain: ReadonlyMap<string, Letter>;
  onOpenSent: (e: Envelope) => void;
  activeId?: string;
  busy: boolean;
  canUnlock: boolean;
  onOpen: (e: Envelope) => void;
  onClose: () => void;
  onCompose: () => void;
  onUnlock: (letters: Envelope[], sent?: boolean) => void;
  onReaderTarget: (target: HTMLDivElement | null) => void;
}) {
  const state = useChainMailbox(box, stateAccess);
  const marks = new Map(state.draft.marks);
  const [checked, setChecked] = useState<string[]>([]);
  const [toolsOpen, setToolsOpen] = useState(
    () => matchMedia("(min-width: 601px)").matches,
  );
  useEffect(() => {
    if (state.loaded) onPreferences(box.id, state.draft);
  }, [box.id, state.loaded, state.draft, onPreferences]);

  const availableFolders = state.loaded
    ? [
        folders[0],
        { id: "unread" as const, label: "Unread", icon: "unread" as const },
        { id: "starred" as const, label: "Starred", icon: "star" as const },
        folders[1],
        { id: "archive" as const, label: "Archive", icon: "archive" as const },
        ...folders.slice(2),
      ]
    : folders;
  const [folder, setFolder] = useState<Folder>("inbox");
  const [query, setQuery] = useState("");
  useEffect(() => {
    setChecked([]);
  }, [folder, query, box.id, state.loaded]);
  const [localSort, setSort] = useState("chain");
  const sort = state.loaded ? state.draft.sort : localSort;
  useEffect(() => {
    if (!state.loaded) setFolder("inbox");
  }, [state.loaded]);
  const [page, setPage] = useState(1);
  const [sentId, setSentId] = useState("");
  const range = useRef<HTMLParagraphElement>(null);
  const inbox = letters.filter(
    (e) =>
      e.mode === "postbox" &&
      e.recipientPostbox === box.id &&
      e.claimAuthority === box.controller,
  );
  // Only a verified reply postbox associates an outgoing letter with this mailbox.
  const sent = letters.filter(
    (e) => e.sender === box.controller && e.replyPostbox === box.id,
  );
  const views: Record<Folder, Envelope[]> = {
    inbox: inbox.filter((e) => !((marks.get(e.id) || 0) & ARCHIVE)),
    starred: inbox.filter((e) => (marks.get(e.id) || 0) & STAR),
    archive: inbox.filter((e) => (marks.get(e.id) || 0) & ARCHIVE),
    unread: inbox.filter((e) => !((marks.get(e.id) || 0) & (READ | ARCHIVE))),
    sent,
    gifts: inbox.filter((e) => BigInt(e.gift) > 0n && !e.claimed),
    collected: inbox.filter((e) => BigInt(e.gift) > 0n && e.claimed),
  };
  const selected =
    folder === "sent"
      ? sent.find((e) => e.id === sentId)
      : inbox.find((e) => e.id === activeId);
  const opened =
    folder !== "sent" && selected && plain.has(selected.id)
      ? selected.id
      : undefined;
  const lastOpened = useRef<string | undefined>(undefined);
  const openedRead = opened ? !!((marks.get(opened) || 0) & READ) : false;
  // Decrypting previews does not mark mail read; only the successfully opened reader does.
  useEffect(() => {
    if (!opened) {
      lastOpened.current = undefined;
      return;
    }
    if (state.loaded && !state.loading && lastOpened.current !== opened) {
      lastOpened.current = opened;
      if (!openedRead) state.markMany([opened], READ, true);
    }
  }, [state.loaded, state.loading, opened, openedRead]);
  const conversationText = new Map(sentPlain);
  for (const [id, letter] of plain) conversationText.set(id, letter);
  const threadLetters = selected
    ? conversation(selected, letters, conversationText, boxes)
    : [];
  function content(e: Envelope) {
    return folder !== "sent"
      ? plain.get(e.id)
      : e.mode === "public"
        ? (e.payload as Letter)
        : sentPlain.get(e.id);
  }
  function correspondent(e: Envelope) {
    if (folder === "sent") {
      const recipient = boxes.find(
        (b) => b.id === e.recipientPostbox && b.controller === e.claimAuthority,
      );
      return recipient
        ? `To ${recipient.nickname}`
        : e.mode === "link"
          ? "Private-link recipient"
          : e.mode === "public"
            ? "Public audience"
            : "Recipient postbox";
    }
    const reply = boxes.find(
      (b) => b.id === e.replyPostbox && b.controller === e.sender,
    );
    return (
      reply?.nickname || `Wallet ${e.sender.slice(0, 8)}…${e.sender.slice(-6)}`
    );
  }
  const found = views[folder].filter((e) =>
    [
      e.id,
      e.sender,
      e.recipientPostbox || "",
      content(e)?.subject || "",
      content(e)?.body || "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  if (sort === "subject")
    found.sort(
      (a, b) =>
        (content(a)?.subject || "\uffff").localeCompare(
          content(b)?.subject || "\uffff",
        ) || a.id.localeCompare(b.id),
    );
  if (sort === "gift")
    found.sort((a, b) =>
      BigInt(a.gift) === BigInt(b.gift)
        ? a.id.localeCompare(b.id)
        : BigInt(a.gift) > BigInt(b.gift)
          ? -1
          : 1,
    );
  const pages = Math.max(1, Math.ceil(found.length / 12));
  const currentPage = Math.min(page, pages);
  const visible = found.slice((currentPage - 1) * 12, currentPage * 12);
  const locked =
    folder === "sent"
      ? sent.filter((e) => hasSentCopy(e) && !sentPlain.get(e.id))
      : inbox.filter((e) => !plain.get(e.id));
  function chooseFolder(next: Folder) {
    setFolder(next);
    setPage(1);
    setSentId("");
    onClose();
  }
  return (
    <div className="mailbox-client">
      <section
        className={`mailbox-workspace ${selected ? "reading" : ""} ${state.loaded ? state.draft.density : ""}`}
        aria-label={`${box.nickname} mailbox`}
      >
        <aside className="mailbox-sidebar">
          {postboxPicker}
          <div className="mailbox-identity">
            <UiIcon name="inbox" />
            <strong>{box.nickname}</strong>
            <small>Wallet-controlled postbox</small>
          </div>
          <button
            className="primary mailbox-compose"
            disabled={busy}
            onClick={onCompose}
          >
            <UiIcon name="compose" /> Compose letter
          </button>
          <nav aria-label="Mailbox folders">
            {availableFolders.map((f) => (
              <button
                key={f.id}
                aria-pressed={folder === f.id}
                onClick={() => chooseFolder(f.id)}
                disabled={busy}
              >
                <UiIcon name={f.icon} />
                <span>{f.label}</span>
                <span className="folder-count">{views[f.id].length}</span>
              </button>
            ))}
          </nav>
          <details
            className="mailbox-tools"
            open={toolsOpen}
            onToggle={(event) => setToolsOpen(event.currentTarget.open)}
          >
            <summary>
              <UiIcon name="settings" /> Postbox options
            </summary>
            <div className="mailbox-secondary">
              <button onClick={onPublic} disabled={busy}>
                <UiIcon name="globe" />
                Public mail & gifts
              </button>
              <button onClick={onPrivacy} disabled={busy}>
                <UiIcon name="privacy" />
                What can others see?
              </button>
            </div>
            {postboxActions}
            <p className="mailbox-device-note">
              Mail and gift states come from Ootle. Reconnect the same Sapient
              wallet on another device to recover your postboxes.
            </p>
          </details>
          {state.ready && (
            <details className="mailbox-preferences" open={!state.loaded}>
              <summary>
                <UiIcon name="settings" /> Mailbox settings
              </summary>
              <div className="mailbox-state-panel">
                <h3>Mailbox settings</h3>
                {!state.loaded ? (
                  <>
                    <p>
                      {state.loading
                        ? "Loading encrypted settings from Ootle…"
                        : state.error
                          ? "Settings could not load. Retry to recover your saved mailbox."
                          : "Settings load automatically after Sapient private access is approved."}
                    </p>
                    {state.error && <p role="alert">{state.error}</p>}
                    <button
                      disabled={busy || state.loading || !stateAccess?.approved}
                      onClick={state.load}
                    >
                      Retry loading mailbox settings
                    </button>
                  </>
                ) : (
                  <>
                    <p role="status">
                      {state.dirty
                        ? "Unsaved changes · this session only"
                        : "Matches saved Ootle settings"}
                    </p>
                    <label>
                      Message spacing
                      <select
                        value={state.draft.density}
                        disabled={busy}
                        onChange={(e) =>
                          state.change({
                            density: e.target.value as
                              | "comfortable"
                              | "compact",
                          })
                        }
                      >
                        <option value="comfortable">Comfortable</option>
                        <option value="compact">Compact</option>
                      </select>
                    </label>
                    <button
                      disabled={busy || state.dirty}
                      onClick={state.reload}
                    >
                      Reload saved settings
                    </button>
                  </>
                )}
              </div>
            </details>
          )}
          <MoonlitScene />
        </aside>
        <div className="mailbox-list-panel">
          <header className="mailbox-list-header">
            <div>
              <span className="kicker">{box.nickname}</span>
              <h2>{availableFolders.find((f) => f.id === folder)?.label}</h2>
            </div>
            <span className="mailbox-mail-count">
              {views[folder].length} loaded
            </span>
          </header>
          <label className="mailbox-search">
            Search this folder
            <input
              type="search"
              value={query}
              maxLength={160}
              placeholder="Subject, message or letter ID"
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="mailbox-sort">
            Sort letters
            <select
              value={sort}
              onChange={(e) => {
                if (state.loaded)
                  state.change({
                    sort: e.target.value as "chain" | "subject" | "gift",
                  });
                else setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="chain">Post office order</option>
              <option value="subject">Subject A–Z · unlocked first</option>
              <option value="gift">Gift amount · largest first</option>
            </select>
          </label>
          {locked.length > 0 && (
            <div className="mailbox-unlock">
              <button
                disabled={busy || !canUnlock}
                onClick={() => onUnlock(locked, folder === "sent")}
              >
                {busy
                  ? "Opening your mail…"
                  : `Unlock ${locked.length} loaded ${locked.length === 1 ? "letter" : "letters"}`}
              </button>
              <p>
                Unlock to see subjects and search contents. Previews stay in
                memory for this wallet session.{" "}
                {canUnlock
                  ? "No transaction is sent."
                  : "Approve postbox view access above first."}
              </p>
            </div>
          )}
          {folder === "sent" && (
            <p className="mailbox-folder-note">
              Letters sent from this postbox. New encrypted Sent copies unlock
              with your Sapient wallet. Older letters without a saved copy show
              delivery details only.
            </p>
          )}
          {state.loaded && folder !== "sent" && (
            <div className="mailbox-bulk" aria-label="Bulk message actions">
              <label>
                <input
                  type="checkbox"
                  checked={
                    !!visible.length &&
                    visible.every((e) => checked.includes(e.id))
                  }
                  disabled={busy || !visible.length}
                  onChange={(event) =>
                    setChecked(
                      event.target.checked
                        ? [
                            ...new Set([
                              ...checked,
                              ...visible.map((e) => e.id),
                            ]),
                          ]
                        : checked.filter(
                            (id) => !visible.some((e) => e.id === id),
                          ),
                    )
                  }
                />{" "}
                Select this page
              </label>
              <span role="status">{checked.length} selected</span>
              {!!checked.length && (
                <>
                  <label>
                    Apply to selected
                    <select
                      aria-label="Actions for selected letters"
                      value=""
                      disabled={busy}
                      onChange={(event) => {
                        const [bit, enabled] = event.target.value.split(":");
                        if (!bit) return;
                        state.markMany(
                          checked.filter((id) =>
                            inbox.some((e) => e.id === id),
                          ),
                          Number(bit),
                          enabled === "true",
                        );
                        setChecked([]);
                        onClose();
                      }}
                    >
                      <option value="">Choose an action…</option>
                      <option value="1:true">Mark as read</option>
                      <option value="1:false">Mark as unread</option>
                      <option value="2:true">Star</option>
                      <option value="2:false">Remove star</option>
                      <option value="4:true">Archive</option>
                      <option value="4:false">Move to inbox</option>
                    </select>
                  </label>
                  <button onClick={() => setChecked([])}>
                    Clear selection
                  </button>
                </>
              )}
              <small>
                Changes stay pending until you save mailbox changes on Ootle.
              </small>
            </div>
          )}
          <p className="mailbox-range" ref={range} tabIndex={-1} role="status">
            {found.length
              ? `${(currentPage - 1) * 12 + 1}–${Math.min(currentPage * 12, found.length)} of ${found.length} loaded letters`
              : "No loaded letters in this view"}
          </p>
          <div className="mailbox-message-list" aria-label="Messages">
            {visible.map((e) => {
              const text = content(e);
              const isSelected = selected?.id === e.id;
              return (
                <div
                  className={`mailbox-message ${isSelected ? "selected" : ""} ${state.loaded && folder !== "sent" ? ((marks.get(e.id) || 0) & READ ? "read" : "unread") : ""}`}
                  key={e.id}
                >
                  {state.loaded && folder !== "sent" && (
                    <label className="mailbox-select">
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={checked.includes(e.id)}
                        aria-label={`Select letter ${e.id}`}
                        onChange={(event) =>
                          setChecked(
                            event.target.checked
                              ? [...checked, e.id]
                              : checked.filter((id) => id !== e.id),
                          )
                        }
                      />
                    </label>
                  )}
                  <button
                    className="mailbox-message-open"
                    data-envelope-id={e.id}
                    disabled={busy}
                    aria-pressed={isSelected}
                    aria-label={
                      text
                        ? `Open letter: ${text.subject}`
                        : `Sealed letter · ${e.id}`
                    }
                    onClick={() => {
                      if (folder === "sent") {
                        onClose();
                        setSentId(e.id);
                        if (hasSentCopy(e) && canUnlock && !sentPlain.get(e.id))
                          onOpenSent(e);
                      } else {
                        setSentId("");
                        onOpen(e);
                      }
                    }}
                  >
                    <span className="mailbox-correspondent">
                      {correspondent(e)}
                    </span>
                    <span className="mailbox-row-heading">
                      <strong>{text?.subject || "A sealed letter"}</strong>
                      {state.loaded &&
                        folder !== "sent" &&
                        !((marks.get(e.id) || 0) & READ) && (
                          <span className="mailbox-unread-label">Unread</span>
                        )}
                      {!!((marks.get(e.id) || 0) & STAR) && (
                        <span aria-label="Starred">★</span>
                      )}
                      <span
                        className="mailbox-seal"
                        aria-label={
                          text
                            ? "Unlocked in this session"
                            : "Encrypted contents"
                        }
                      >
                        {text ? "✉" : "◇"}
                      </span>
                    </span>
                    <span className="mailbox-row-preview">
                      {text
                        ? text.body.slice(0, 100)
                        : "Subject and message are encrypted."}
                    </span>
                    <span className="mailbox-row-meta">
                      <span>
                        {e.id.length > 22
                          ? `${e.id.slice(0, 10)}…${e.id.slice(-6)}`
                          : e.id}
                      </span>
                      <span>
                        {e.claimed && BigInt(e.gift) > 0n
                          ? "Gift collected"
                          : BigInt(e.gift) > 0n
                            ? `${tari(e.gift)} TARI gift`
                            : e.mode === "public"
                              ? "Public note"
                              : "Private note"}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
            {!found.length && (
              <div className="mailbox-empty">
                <span aria-hidden="true">☾</span>
                <h3>
                  {query
                    ? "No matching letters"
                    : folder === "inbox"
                      ? "Your inbox is quiet"
                      : "Nothing here yet"}
                </h3>
                <p>
                  {query
                    ? "Locked letters can only be found by public IDs and routing details. Unlock your mail to search its contents."
                    : folder === "inbox"
                      ? "Share your postbox invitation so a friend can write to you."
                      : "Choose another folder to find your mail."}
                </p>
              </div>
            )}
          </div>
          {pages > 1 && (
            <div className="mailbox-pagination">
              <button
                disabled={currentPage === 1 || busy}
                onClick={() => {
                  setPage(currentPage - 1);
                  range.current?.focus();
                }}
              >
                Previous
              </button>
              <span>
                Page {currentPage} of {pages}
              </span>
              <button
                disabled={currentPage === pages || busy}
                onClick={() => {
                  setPage(currentPage + 1);
                  range.current?.focus();
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
        <div className={`mailbox-reading-pane ${selected ? "has-letter" : ""}`}>
          {selected && (
            <div className="mailbox-reading-tools">
              <button
                disabled={busy}
                onClick={() => {
                  onClose();
                  setSentId("");
                }}
              >
                <UiIcon name="back" /> Back to messages
              </button>
              <span>
                {folder === "sent"
                  ? "Sent letter"
                  : "Only your wallet unlocks this letter"}
              </span>
            </div>
          )}
          <div ref={onReaderTarget} className="mailbox-reader-target" />
          {folder === "sent" && selected && (
            <article className="mailbox-sent-detail">
              <span className="kicker">SENT ON OOTLE</span>
              <h2>{content(selected)?.subject || "Your sealed letter"}</h2>
              {content(selected) ? (
                <p className="letter-body">{content(selected)!.body}</p>
              ) : hasSentCopy(selected) ? (
                <p>
                  Approve private view access above and unlock Sent to read your
                  encrypted copy. Reading sends no transaction.
                </p>
              ) : (
                <p>
                  This older letter has no saved encrypted sender copy. Its
                  delivery details remain available; a private-link letter still
                  opens with its original secret link.
                </p>
              )}
              {content(selected)?.privatePayment && (
                <PrivatePaymentCard
                  payment={content(selected)!.privatePayment!}
                />
              )}
              <dl>
                <dt>Letter ID</dt>
                <dd>{selected.id}</dd>
                <dt>Recipient postbox</dt>
                <dd>
                  {selected.recipientPostbox || "Public mail or private link"}
                </dd>
                <dt>Original gift</dt>
                <dd>
                  {tari(selected.gift)} TARI ·{" "}
                  {BigInt(selected.gift) === 0n
                    ? "No gift attached"
                    : selected.claimed
                      ? "Collected"
                      : "Not collected"}
                </dd>
              </dl>
              <p className="fine-print">
                A confirmed letter does not prove it has been read. A collected
                gift does not identify its recipient here.
              </p>
            </article>
          )}
          {selected && threadLetters.length > 1 && (
            <section
              className="mailbox-conversation"
              aria-label="Reply conversation"
            >
              <h3>Conversation · {threadLetters.length} unlocked letters</h3>
              <p>
                Loaded replies from these two verified postboxes. Unlock Inbox
                and Sent, and load more mail to see additional messages.
              </p>
              {threadLetters.map((e) => (
                <details key={e.id} open={e.id === selected.id}>
                  <summary>
                    {e.sender === box.controller
                      ? "You"
                      : boxes.find((p) => p.id === e.replyPostbox)?.nickname ||
                        "Correspondent"}{" "}
                    · {conversationText.get(e.id)?.subject}
                  </summary>
                  <p className="letter-body">
                    {conversationText.get(e.id)?.body}
                  </p>
                  <small>
                    Letter {e.id}
                    {e.id === selected.id ? " · Currently open" : ""}
                  </small>
                  {e.sender !== box.controller && e.replyPostbox && (
                    <button
                      disabled={busy}
                      onClick={() => onReply(e, conversationText.get(e.id)!)}
                    >
                      Reply to this message
                    </button>
                  )}
                </details>
              ))}
            </section>
          )}
          {!selected && (
            <div className="mailbox-reading-empty">
              <span aria-hidden="true">✉</span>
              <h2>A quiet place to read.</h2>
              <p>Choose a letter from your mailbox.</p>
              <small>Encrypted contents. Public transaction metadata.</small>
            </div>
          )}
        </div>
      </section>
      <MailboxSaveBar
        state={state}
        busy={busy}
        blocked={stateAccess?.writeBlocked}
      />
    </div>
  );
}
