import { useRef, useState } from "react";
import type { Envelope } from "../core/types";
import { tari } from "./AmountInput";
import type { Pending } from "../core/pending";
import { CopyField } from "./CopyField";
import { UiIcon } from "./UiIcon";
import {
  activityDetails,
  activityMatches,
  newestActivity,
  type ActivityFilter,
} from "./activity-details";

export function ActivityBook({
  records,
  busy,
  canCheck,
  canResume,
  publicTitles,
  mailDetails,
  onCheck,
  onResume,
  onRead,
  onInbox,
  onPot,
  sample = false,
}: {
  records: Pending[];
  busy: boolean;
  canCheck: boolean;
  canResume: boolean;
  publicTitles: Record<string, string>;
  mailDetails: Record<string, Pick<Envelope, "mode" | "gift" | "reserve">>;
  onCheck: (pending: Pending) => void;
  onResume: (pending: Pending) => void;
  onRead: (id: string) => void;
  onInbox: () => void;
  onPot?: () => void;
  sample?: boolean;
}) {
  const range = useRef<HTMLParagraphElement>(null);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [operation, setOperation] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const searched = query.trim().toLowerCase();
  const matches = newestActivity(records).filter(
    (p) =>
      activityMatches(p, filter) &&
      (operation === "all" || p.operation === operation) &&
      (!searched ||
        [
          p.id,
          p.envelopeId,
          activityDetails(p).title,
          publicTitles[p.envelopeId] || "",
        ].some((value) => value.toLowerCase().includes(searched))),
  );
  const pages = Math.max(1, Math.ceil(matches.length / 12));
  const current = Math.min(page, pages);
  const start = (current - 1) * 12;
  function turnPage(next: number) {
    setPage(next);
    requestAnimationFrame(() => range.current?.focus());
  }
  function change(action: () => void) {
    action();
    setPage(1);
  }
  return (
    <div className="activity-book">
      <div
        className="activity-summary"
        aria-label={sample ? "Sample activity summary" : "Activity summary"}
      >
        <div>
          <button
            className="activity-summary-link"
            aria-pressed={filter === "pending"}
            onClick={() =>
              change(() => setFilter(filter === "pending" ? "all" : "pending"))
            }
          >
            <strong>
              {records.filter((p) => activityMatches(p, "pending")).length}
            </strong>
            <span>Awaiting confirmation</span>
          </button>
        </div>
        <div>
          <button
            className="activity-summary-link"
            aria-pressed={filter === "confirmed"}
            onClick={() =>
              change(() =>
                setFilter(filter === "confirmed" ? "all" : "confirmed"),
              )
            }
          >
            <strong>
              {records.filter((p) => activityMatches(p, "confirmed")).length}
            </strong>
            <span>Completed</span>
          </button>
        </div>
        <div>
          <button
            className="activity-summary-link"
            aria-pressed={filter === "rejected"}
            onClick={() =>
              change(() =>
                setFilter(filter === "rejected" ? "all" : "rejected"),
              )
            }
          >
            <strong>
              {records.filter((p) => p.state === "rejected").length}
            </strong>
            <span>Not completed</span>
          </button>
        </div>
      </div>
      <div className="activity-tools">
        <label>
          Find an action
          <input
            type="search"
            maxLength={160}
            value={query}
            onChange={(e) => change(() => setQuery(e.target.value))}
            placeholder="Action, public subject or ID"
          />
        </label>
        <label>
          Activity status
          <select
            value={filter}
            onChange={(e) =>
              change(() => setFilter(e.target.value as ActivityFilter))
            }
          >
            <option value="all">All statuses</option>
            <option value="pending">Awaiting confirmation</option>
            <option value="confirmed">Completed</option>
            <option value="rejected">Not completed</option>
          </select>
        </label>
        <label>
          Action type
          <select
            value={operation}
            onChange={(e) => change(() => setOperation(e.target.value))}
          >
            <option value="all">All actions</option>
            <option value="publish">Letters sent</option>
            <option value="pot">Moon Pot</option>
            <option value="claim">Gift collections</option>
            <option value="mailbox">Mailbox settings</option>
            <option value="postbox">Postbox changes</option>
            <option value="capsule">Recovery backups</option>
          </select>
        </label>
      </div>
      <p className="activity-range" role="status" ref={range} tabIndex={-1}>
        {matches.length
          ? `Showing ${start + 1}–${Math.min(start + 12, matches.length)} of ${matches.length} actions`
          : "No actions match these filters."}
        {sample
          ? " · Fictional examples"
          : " · This browser, selected post office"}
      </p>
      {!matches.length && (
        <div className="quiet-state">
          <h2>No matching activity.</h2>
          <p>Try another word or show all actions.</p>
          <button
            onClick={() => {
              setQuery("");
              setFilter("all");
              setOperation("all");
              setPage(1);
            }}
          >
            Clear activity filters
          </button>
        </div>
      )}
      <div className="activity-entries">
        {matches.slice(start, start + 12).map((p) => {
          const detail = activityDetails(p);
          const mail = mailDetails[p.envelopeId];
          const compact =
            detail.tone === "confirmed" &&
            (p.operation === "publish" || p.operation === "claim");
          const nextStep = (
            <p className="activity-next">
              <strong>What next</strong>
              {detail.nextStep}
            </p>
          );
          return (
            <article
              className={`pending delivery-card activity-entry activity-${detail.tone}`}
              key={p.id}
            >
              <div className="activity-entry-heading">
                <span className="activity-action-icon">
                  <UiIcon
                    name={
                      p.operation === "publish"
                        ? "sent"
                        : p.operation === "claim"
                          ? "gift"
                          : p.operation === "capsule"
                            ? "privacy"
                            : p.operation === "mailbox"
                              ? "settings"
                              : "inbox"
                    }
                  />
                </span>
                <div className="activity-action-title">
                  {sample && (
                    <span className="activity-kind">SAMPLE ACTION</span>
                  )}
                  <h2>{detail.title}</h2>
                </div>
                <span className={`activity-badge badge-${detail.tone}`}>
                  {detail.label}
                </span>
              </div>
              {publicTitles[p.envelopeId] && (
                <p className="activity-subject">{publicTitles[p.envelopeId]}</p>
              )}
              <p className="activity-explanation">{detail.explanation}</p>
              {!compact && nextStep}
              <div className="activity-entry-footer">
                <span>
                  {p.createdAt ? (
                    <>
                      <span>{sample ? "Sample started" : "Started"} </span>
                      <time dateTime={new Date(p.createdAt).toISOString()}>
                        {new Date(p.createdAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </time>
                    </>
                  ) : (
                    "Start time was not saved for this older entry."
                  )}
                </span>
                {detail.tone === "review" && (
                  <span className="activity-review-note">
                    Keep the original attempt
                  </span>
                )}
              </div>
              <div className="activity-entry-actions">
                {!sample && (
                  <button
                    disabled={!canCheck || busy}
                    onClick={() => onCheck(p)}
                  >
                    Check status
                  </button>
                )}
                {!sample &&
                  p.walletRequest &&
                  p.id.startsWith("attempt:") &&
                  p.state === "unknown" && (
                    <button
                      disabled={!canResume || busy}
                      onClick={() => onResume(p)}
                    >
                      Resume Sapient approval
                    </button>
                  )}
                {!sample && publicTitles[p.envelopeId] && (
                  <button disabled={busy} onClick={() => onRead(p.envelopeId)}>
                    Read public letter ↗
                  </button>
                )}
                {!sample &&
                  ["postbox", "capsule", "mailbox"].includes(p.operation) && (
                    <button disabled={busy} onClick={onInbox}>
                      Open My inbox ↗
                    </button>
                  )}
                {!sample && p.operation === "pot" && onPot && (
                  <button disabled={busy} onClick={onPot}>
                    Open Moon Pot ↗
                  </button>
                )}
              </div>
              <details className="activity-receipt">
                <summary>
                  {sample
                    ? "Sample references"
                    : detail.hasReceipt
                      ? "Transaction and delivery details"
                      : "Original attempt details"}
                </summary>
                {compact && nextStep}
                {mail && (
                  <>
                    <dl className="activity-mail-details">
                      <div>
                        <dt>Letter type</dt>
                        <dd>
                          {
                            {
                              public: "Public mail",
                              link: "Private link",
                              postbox: "Postbox mail",
                            }[mail.mode]
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>Gift originally attached</dt>
                        <dd>
                          {mail.gift === "0"
                            ? "No gift"
                            : `${tari(mail.gift)} ${sample ? "sample" : "test"} TARI`}
                        </dd>
                      </div>
                      <div>
                        <dt>Collection reserve originally funded</dt>
                        <dd>
                          {mail.reserve === "0"
                            ? "No collection reserve"
                            : `${tari(mail.reserve)} ${sample ? "sample" : "test"} TARI`}
                        </dd>
                      </div>
                    </dl>
                    <p className="fine-print">
                      {sample
                        ? "These amounts are fictional examples."
                        : "These are the letter’s stored funding amounts, not the fees actually paid or the remaining reserve. Check the original receipt and the receiving wallet to confirm the destination and amount received."}
                    </p>
                  </>
                )}
                <CopyField
                  label={
                    sample
                      ? "Sample transaction reference"
                      : detail.hasReceipt
                        ? "Transaction ID"
                        : "Local attempt ID"
                  }
                  buttonLabel={
                    sample
                      ? "Copy sample reference"
                      : detail.hasReceipt
                        ? "Copy transaction ID"
                        : "Copy attempt ID"
                  }
                  value={p.id}
                />
                <CopyField
                  label={`${sample ? "Sample " : ""}${detail.entityLabel}`}
                  buttonLabel="Copy delivery reference"
                  value={detail.entity}
                />
                {p.capsule && (
                  <p className="fine-print">
                    Recovery key version {p.capsule.context.keyVersion}. This
                    backup belongs to the postbox shown above.
                  </p>
                )}
                {p.walletRequest && (
                  <p className="fine-print">
                    Saved Sapient request: <code>{p.walletRequest.id}</code>.
                    Resume this request rather than creating a replacement.
                  </p>
                )}
                <p className="fine-print">
                  {sample
                    ? "These references are fictional and cannot be checked on the network."
                    : "This is a local record for the selected post office. Private letter contents and secret links are not saved in this delivery book."}
                </p>
              </details>
            </article>
          );
        })}
      </div>
      {pages > 1 && (
        <nav className="pagination" aria-label="Activity pages">
          <button
            disabled={current === 1}
            onClick={() => turnPage(current - 1)}
          >
            Previous activity
          </button>
          <span>
            Page {current} of {pages}
          </span>
          <button
            disabled={current === pages}
            onClick={() => turnPage(current + 1)}
          >
            Next activity
          </button>
        </nav>
      )}
    </div>
  );
}
