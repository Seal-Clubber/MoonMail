import { useRef, useState } from "react";
import type { Envelope, Letter, Postbox } from "../core/types";
import { tari } from "./AmountInput";

// Every folder is a view of loaded on-chain state, not a device-only mailbox record.
type Folder = "inbox" | "gifts" | "collected" | "sent";
const folders: { id: Folder; label: string; icon: string }[] = [
  { id: "inbox", label: "Inbox", icon: "✉" },
  { id: "gifts", label: "Available gifts", icon: "◇" },
  { id: "collected", label: "Collected gifts", icon: "✓" },
  { id: "sent", label: "Sent", icon: "↗" },
];
export function MailboxWorkspace({
  box,
  letters,
  plain,
  activeId,
  busy,
  canUnlock,
  onOpen,
  onClose,
  onCompose,
  onUnlock,
  onReaderTarget,
}: {
  box: Postbox;
  letters: Envelope[];
  plain: Record<string, Letter>;
  activeId?: string;
  busy: boolean;
  canUnlock: boolean;
  onOpen: (e: Envelope) => void;
  onClose: () => void;
  onCompose: () => void;
  onUnlock: (letters: Envelope[]) => void;
  onReaderTarget: (target: HTMLDivElement | null) => void;
}) {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("chain");
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
    inbox,
    sent,
    gifts: inbox.filter((e) => BigInt(e.gift) > 0n && !e.claimed),
    collected: inbox.filter((e) => BigInt(e.gift) > 0n && e.claimed),
  };
  const selected =
    folder === "sent"
      ? sent.find((e) => e.id === sentId)
      : inbox.find((e) => e.id === activeId);
  function content(e: Envelope) {
    return folder !== "sent"
      ? plain[e.id]
      : e.mode === "public"
        ? (e.payload as Letter)
        : undefined;
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
  const locked = inbox.filter((e) => !plain[e.id]);
  function chooseFolder(next: Folder) {
    setFolder(next);
    setPage(1);
    setSentId("");
    onClose();
  }
  return (
    <section
      className={`mailbox-workspace ${selected ? "reading" : ""}`}
      aria-label={`${box.nickname} mailbox`}
    >
      <aside className="mailbox-sidebar">
        <div className="mailbox-identity">
          <span aria-hidden="true">✉</span>
          <strong>{box.nickname}</strong>
          <small>Wallet-controlled postbox</small>
        </div>
        <button
          className="primary mailbox-compose"
          disabled={busy}
          onClick={onCompose}
        >
          Compose letter <span aria-hidden="true">＋</span>
        </button>
        <nav aria-label="Mailbox folders">
          {folders.map((f) => (
            <button
              key={f.id}
              aria-pressed={folder === f.id}
              onClick={() => chooseFolder(f.id)}
              disabled={busy}
            >
              <span aria-hidden="true">{f.icon}</span>
              <span>{f.label}</span>
              <span className="folder-count">{views[f.id].length}</span>
            </button>
          ))}
        </nav>
        <p className="mailbox-device-note">
          Mail and gift states come from Ootle. Reconnect the same Sapient
          wallet on another device to recover your postboxes.
        </p>
      </aside>
      <div className="mailbox-list-panel">
        <header className="mailbox-list-header">
          <div>
            <span className="kicker">{box.nickname}</span>
            <h2>{folders.find((f) => f.id === folder)?.label}</h2>
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
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="chain">Post office order</option>
            <option value="subject">Subject A–Z · unlocked first</option>
            <option value="gift">Gift amount · largest first</option>
          </select>
        </label>
        {folder !== "sent" && locked.length > 0 && (
          <div className="mailbox-unlock">
            <button
              disabled={busy || !canUnlock}
              onClick={() => onUnlock(locked)}
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
            Loaded on-chain letters sent with this reply postbox. Encrypted sent
            copies are not saved or recoverable here.
          </p>
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
                className={`mailbox-message ${isSelected ? "selected" : ""}`}
                key={e.id}
              >
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
                    } else {
                      setSentId("");
                      onOpen(e);
                    }
                  }}
                >
                  <span className="mailbox-row-heading">
                    <strong>{text?.subject || "A sealed letter"}</strong>
                    <span
                      className="mailbox-seal"
                      aria-label={
                        text ? "Unlocked in this session" : "Encrypted contents"
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
              Back to messages
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
            <h2>
              {selected.mode === "public"
                ? (selected.payload as Letter).subject
                : "Your sealed letter"}
            </h2>
            {selected.mode === "public" ? (
              <p className="letter-body">{(selected.payload as Letter).body}</p>
            ) : (
              <p>
                The recipient controls decryption. GhostDrop does not retain a
                plaintext copy of encrypted sent mail.
              </p>
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
  );
}
