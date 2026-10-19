import { useEffect, useRef, useState } from "react";
import { UiIcon } from "./UiIcon";
import { AmountInput, tari } from "./AmountInput";
import {
  potOdds,
  potPhase,
  potRules,
  potWritesReady,
  type PotRound,
} from "../core/moon-pot";
import {
  MoonPotClient,
  parsePotProfile,
  type PotIntent,
} from "../core/moon-pot-client";
import { SapientSession } from "../core/sapient";
import type { Deployment, Postbox } from "../core/types";
import type { FeeProblem } from "../core/fee-limit";
import { FeeAdjustment } from "./FeeAdjustment";

// An explicitly labelled design preview. Never used for wallet transactions.
const examples: PotRound = {
  component: "",
  start: 0,
  draw: 504,
  total: "100000000",
  winner: "",
  seed: "",
  paid: false,
  entries: [
    {
      postbox: "moonlit",
      controller: "",
      amount: "50000000",
      message: "A little moonlight for the next lucky soul. 🌙",
    },
    {
      postbox: "night-owl",
      controller: "",
      amount: "30000000",
      message: "Sending my wish into the pot.",
    },
    {
      postbox: "spectral-clerk",
      controller: "",
      amount: "20000000",
      message: "May the moon favour your postbox.",
    },
  ],
  participants: {
    moonlit: { controller: "", amount: "50000000", refunded: false },
    "night-owl": { controller: "", amount: "30000000", refunded: false },
    "spectral-clerk": { controller: "", amount: "20000000", refunded: false },
  },
};
export function MoonPot({
  deployment,
  wallet,
  postboxes,
  fee,
  busy,
  task,
  onConnect,
  onActivity,
  feeProblem,
  onFeeChange,
}: {
  deployment: Deployment;
  wallet?: SapientSession;
  postboxes: Postbox[];
  fee: string;
  busy: boolean;
  task: (work: () => Promise<void>) => Promise<void>;
  onConnect: () => void;
  onActivity: () => void;
  feeProblem?: FeeProblem;
  onFeeChange: (fee: string) => void;
}) {
  const [preview, setPreview] = useState(false),
    [amount, setAmount] = useState("1000000");
  const [client, setClient] = useState<MoonPotClient>(),
    [snapshot, setSnapshot] =
      useState<Awaited<ReturnType<MoonPotClient["read"]>>>(),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(""),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState(""),
    [historyLimit, setHistoryLimit] = useState(8),
    [message, setMessage] = useState(""),
    [postbox, setPostbox] = useState(""),
    [accepted, setAccepted] = useState(false),
    [review, setReview] = useState<PotIntent>(),
    [postage, setPostage] = useState<"private" | "transparent">("private");
  const generation = useRef(0);
  useEffect(() => {
    let cancelled = false,
      connected: MoonPotClient | undefined;
    const sequence = ++generation.current;
    setSnapshot(undefined);
    setClient(undefined);
    setReview(undefined);
    setAccepted(false);
    setLoadError("");
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 15000);
    void (async () => {
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}moon-pot.json`,
          { cache: "no-store", signal: abort.signal },
        );
        if (!response.ok) throw new Error("Pot configuration is unavailable");
        const value = await response.json();
        if (value.deployment === null) return;
        const profile = parsePotProfile(value.deployment, deployment);
        connected = await MoonPotClient.connect(deployment, profile);
        const data = await connected.read();
        if (cancelled || sequence !== generation.current) {
          connected.stop();
          return;
        }
        setClient(connected);
        setSnapshot(data);
      } catch {
        if (!cancelled)
          setLoadError(
            "Could not verify the pot right now. No payment is available; try reloading this page.",
          );
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      cancelled = true;
      generation.current++;
      clearTimeout(timer);
      abort.abort();
      connected?.stop();
    };
  }, [deployment]);
  const round = preview
    ? examples
    : snapshot?.history.find((r) => r.component === selected) ||
      snapshot?.round;
  const controller = wallet?.accounts[0]?.account.owner_public_key;
  const owned = postboxes.filter((p) => p.controller === controller);
  const box = owned.some((p) => p.id === postbox)
    ? postbox
    : owned[0]?.id || "";
  useEffect(() => {
    setAccepted(false);
    setReview(undefined);
    setPostbox("");
  }, [controller]);
  const phase =
    round && snapshot && !preview ? potPhase(round, snapshot.epoch) : undefined;
  const enabled = !preview && potWritesReady(client?.profile, accepted);
  async function refresh(limit = historyLimit) {
    if (!client || loading) return;
    const sequence = generation.current;
    setLoading(true);
    setLoadError("");
    try {
      const next = await client.read(limit, selected || undefined);
      if (sequence === generation.current) setSnapshot(next);
    } catch {
      if (sequence === generation.current)
        setLoadError(
          "The latest pot state could not be verified. Refresh before reviewing an action.",
        );
    } finally {
      if (sequence === generation.current) setLoading(false);
    }
  }
  function prepare(intent: PotIntent) {
    setReview({ ...intent, ...(round ? { round: round.component } : {}) });
    setNotice("");
  }
  function submit() {
    if (!client || !wallet || !review || !enabled || loadError) return;
    const intent = review,
      sequence = generation.current;
    void task(async () => {
      const id = await client.submit(
        wallet,
        fee,
        localStorage,
        intent,
        accepted,
        postage,
      );
      if (sequence !== generation.current) return;
      setReview(undefined);
      setNotice(
        `Submitted to Ootle. Check the original receipt in Activity before another attempt. Transaction: ${id}`,
      );
      await refresh();
    });
  }
  return (
    <section className="moon-pot-page" aria-labelledby="moon-pot-title">
      <div className="pot-page-heading">
        <div>
          <span className="kicker">A COMMUNITY WISH UNDER THE MOON</span>
          <h1 id="moon-pot-title">
            Moon <em>Pot.</em>
          </h1>
          <p>
            A weekly pot shared by postboxes. Leave a public message, add test
            TARI and take a chance.
          </p>
        </div>
        <span className="pot-testnet">Esmeralda testnet</span>
      </div>
      {loadError && (
        <p role="alert" className="message error">
          {loadError}
        </p>
      )}
      {notice && (
        <div role="status" className="message">
          <p>{notice}</p>
          <button onClick={onActivity} disabled={busy}>
            View pot activity ↗
          </button>
        </div>
      )}
      {client && !preview && (
        <div className="pot-round-picker">
          <label>
            Pot round
            <select
              value={round?.component || ""}
              disabled={busy || loading}
              onChange={(e) => {
                setSelected(e.target.value);
                setReview(undefined);
              }}
            >
              {snapshot?.history.map((r) => (
                <option key={r.component} value={r.component}>
                  Epoch {r.start} ·{" "}
                  {r.winner ? `Winner: ${r.winner}` : "Weekly round"}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy || loading} onClick={() => void refresh()}>
            {loading ? "Refreshing…" : "Refresh pot"}
          </button>
          {snapshot && snapshot.totalRounds > snapshot.history.length && (
            <button
              disabled={busy || loading}
              onClick={() => {
                setHistoryLimit((n) => n + 8);
                void refresh(historyLimit + 8);
              }}
            >
              Load older rounds
            </button>
          )}
        </div>
      )}
      <div className="pot-layout">
        <div className="pot-main">
          <section className="pot-hero" aria-label="Weekly pot">
            <div className="pot-moon" aria-hidden="true">
              ☾
            </div>
            <div className="pot-cauldron" aria-hidden="true">
              <span>✦</span>
              <span>✧</span>
              <span>✦</span>
              <UiIcon name="gift" />
            </div>
            <span className="kicker">
              {preview ? "FICTIONAL DESIGN PREVIEW" : "WEEKLY COMMUNITY POT"}
            </span>
            <strong className="pot-total">
              {round ? tari(round.total) : "—"}
              <small> test TARI</small>
            </strong>
            <p>
              {preview
                ? "Example round · these contributions are fictional."
                : round
                  ? `Round starting at epoch ${round.start}.`
                  : "The first pot is being prepared. Contributions are not open."}
            </p>
            {round && !preview && snapshot && (
              <p className="pot-live-state">
                {phase === "open"
                  ? `Contributions close at epoch ${round.draw - potRules.closedEpochs}.`
                  : phase === "closed"
                    ? `Contributions are locked. Draw epoch: ${round.draw}.`
                    : phase === "draw"
                      ? "The fixed draw window is open now."
                      : phase === "refund"
                        ? "The draw window was missed. Contributors can reclaim their own funds."
                        : phase === "waiting"
                          ? `This round opens at epoch ${round.start}.`
                          : `Winning postbox: ${round.winner}${round.paid ? " · prize collected" : " · prize awaiting collection"}`}{" "}
                Current epoch: {snapshot.epoch}.
              </p>
            )}
            <div className="pot-stats">
              <div>
                <strong>
                  {round ? Object.keys(round.participants).length : "—"}
                </strong>
                <span>Postboxes</span>
              </div>
              <div>
                <strong>{round ? round.entries.length : "—"}</strong>
                <span>Messages</span>
              </div>
              <div>
                <strong>Weekly</strong>
                <span>One winning postbox</span>
              </div>
            </div>
          </section>
          <section
            className="pot-messages"
            aria-labelledby="pot-messages-title"
          >
            <div className="pot-list-heading">
              <h2 id="pot-messages-title">Wishes in the pot</h2>
              {preview && (
                <span className="pot-preview-badge">Fictional examples</span>
              )}
            </div>
            {round ? (
              round.entries.map((entry, i) => (
                <article className="pot-entry" key={i}>
                  <div className="pot-entry-heading">
                    <strong>
                      <UiIcon name="inbox" />
                      {entry.postbox}
                    </strong>
                    <span>{tari(entry.amount)} TARI</span>
                  </div>
                  <p>{entry.message}</p>
                  <span className="pot-entry-share">
                    {potOdds(
                      round.participants[entry.postbox].amount,
                      round.total,
                    )}{" "}
                    of the pot · current chance
                  </span>
                </article>
              ))
            ) : (
              <div className="quiet-state">
                <UiIcon name="mail" />
                <h3>The pot is quiet.</h3>
                <p>
                  Confirmed contributions will appear here with their postbox,
                  message and amount.
                </p>
              </div>
            )}
          </section>
        </div>
        <aside className="pot-sidebar" aria-label="Pot details">
          {client && !preview && (
            <section className="pot-contribute">
              <h2>
                {phase === "won"
                  ? "Collect the prize"
                  : phase === "refund"
                    ? "Reclaim your contribution"
                    : "Add your wish"}
              </h2>
              {client.profile.experimental && (
                <div className="pot-experimental">
                  <strong>Experimental testnet draw</strong>
                  <p>
                    The fixed future-epoch seed is not proven resistant to
                    oracle lag or miner influence. Displayed shares describe the
                    intended weighted draw, not a guarantee of fair randomness.
                    No live prize payout has been verified unless stated in the
                    deployment evidence.
                  </p>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={accepted}
                      disabled={busy}
                      onChange={(e) => {
                        setAccepted(e.target.checked);
                        setReview(undefined);
                      }}
                    />
                    I understand these limitations and will use test TARI only.
                  </label>
                </div>
              )}
              {!wallet ? (
                <button onClick={onConnect}>Connect Sapient for the pot</button>
              ) : (
                <>
                  <label>
                    Your postbox
                    <select
                      value={box}
                      disabled={busy}
                      onChange={(e) => {
                        setPostbox(e.target.value);
                        setReview(undefined);
                      }}
                    >
                      {!owned.length && (
                        <option value="">
                          Create a postbox in My inbox first
                        </option>
                      )}
                      {owned.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nickname} · {b.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Fee funding
                    <select
                      value={postage}
                      disabled={busy}
                      onChange={(e) => {
                        setPostage(e.target.value as "private" | "transparent");
                        setReview(undefined);
                      }}
                    >
                      <option value="private">
                        Private TARI for transaction fees
                      </option>
                      <option value="transparent">
                        Public TARI for transaction fees
                      </option>
                    </select>
                  </label>
                  <p className="fine-print">
                    Pot contributions and winnings use public TARI. Fee funding
                    is separate. Your private-mail reading permission is not
                    needed.
                  </p>
                  {phase === "open" && (
                    <>
                      <AmountInput
                        label="Your contribution"
                        value={amount}
                        disabled={busy}
                        onChange={(v) => {
                          setAmount(v);
                          setReview(undefined);
                        }}
                      />
                      <label>
                        Public message
                        <textarea
                          value={message}
                          maxLength={512}
                          disabled={busy}
                          rows={3}
                          onChange={(e) => {
                            setMessage(e.target.value);
                            setReview(undefined);
                          }}
                        />
                      </label>
                      <p className="fine-print">
                        Minimum 0.1 TARI · maximum 512 UTF-8 bytes per message ·
                        128 entries per round.
                      </p>
                      <button
                        className="primary"
                        disabled={
                          !enabled ||
                          busy ||
                          loading ||
                          !!loadError ||
                          !box ||
                          !amount ||
                          !message.trim() ||
                          new TextEncoder().encode(message).length > 512
                        }
                        onClick={() =>
                          prepare({
                            action: "contribute",
                            postbox: box,
                            amount,
                            message,
                          })
                        }
                      >
                        Review contribution
                      </button>
                    </>
                  )}
                  {phase === "draw" && (
                    <button
                      disabled={
                        !enabled ||
                        busy ||
                        loading ||
                        !!loadError ||
                        !round ||
                        round.total === "0"
                      }
                      onClick={() => prepare({ action: "draw" })}
                    >
                      Review winner draw
                    </button>
                  )}
                  {phase === "won" &&
                    round?.participants[round.winner]?.controller ===
                      controller && (
                      <button
                        className="primary"
                        disabled={!enabled || busy || loading || !!loadError}
                        onClick={() => prepare({ action: "claim" })}
                      >
                        Review prize collection
                      </button>
                    )}
                  {phase === "refund" &&
                    round?.participants[box] &&
                    !round.participants[box].refunded && (
                      <button
                        disabled={!enabled || busy || loading || !!loadError}
                        onClick={() =>
                          prepare({ action: "refund", postbox: box })
                        }
                      >
                        Review contribution refund
                      </button>
                    )}
                  {snapshot && snapshot.epoch >= snapshot.next && (
                    <button
                      disabled={!enabled || busy || loading || !!loadError}
                      onClick={() => prepare({ action: "open" })}
                    >
                      Review opening the next round
                    </button>
                  )}
                  <FeeAdjustment
                    problem={feeProblem}
                    label="Pot transaction fee limit"
                    value={fee}
                    busy={busy}
                    onChange={(v) => {
                      onFeeChange(v);
                      setReview(undefined);
                    }}
                  />
                  {review && (
                    <section className="review" aria-label="Pot action review">
                      <h3>Review {review.action}</h3>
                      {review.action === "contribute" && (
                        <>
                          <p>
                            <strong>{tari(review.amount!)} TARI</strong> from
                            postbox {review.postbox} will be added publicly. You
                            may lose the full contribution.
                          </p>
                          <p>{review.message}</p>
                          <p>
                            Current estimated share after adding:{" "}
                            {round
                              ? potOdds(
                                  (
                                    BigInt(
                                      round.participants[review.postbox!]
                                        ?.amount || "0",
                                    ) + BigInt(review.amount!)
                                  ).toString(),
                                  (
                                    BigInt(round.total) + BigInt(review.amount!)
                                  ).toString(),
                                )
                              : "—"}
                            . Contributions can change this before the cutoff.
                          </p>
                        </>
                      )}
                      <p>
                        Transaction fee cap: {tari(fee)} TARI, funded from{" "}
                        {postage === "private" ? "private" : "public"} funds.
                      </p>
                      {["claim", "refund"].includes(review.action) && (
                        <p>
                          Receiving account:{" "}
                          {wallet.accounts[0].account.component_address}
                        </p>
                      )}
                      <button
                        className="primary"
                        disabled={!enabled || busy || loading || !!loadError}
                        onClick={submit}
                      >
                        Approve in Sapient
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => setReview(undefined)}
                      >
                        Cancel review
                      </button>
                    </section>
                  )}
                </>
              )}
            </section>
          )}
          <section className="pot-how">
            <h2>How it works</h2>
            <ol>
              <li>
                <strong>Add your wish.</strong> Choose a postbox, write a public
                message and review your contribution in Sapient.
              </li>
              <li>
                <strong>Your amount sets your odds.</strong> Put in 10 of a
                100-TARI pot for a 10% chance. Further contributions change
                those odds.
              </li>
              <li>
                <strong>One postbox wins.</strong> The winner can collect the
                full pot. Transaction fees are separate; there is no house cut.
              </li>
            </ol>
            <p className="fine-print">
              Postbox names, messages, amounts and results are public. This pot
              does not offer private payments.
            </p>
          </section>
          {!client && (
            <section className="pot-preparation" role="status">
              <h2>Before the first round</h2>
              <p>
                The draw and payout are being verified. No pot has been deployed
                or opened, and this page cannot request a payment.
              </p>
              <p>
                If a future draw misses its fixed window, the contract design
                lets contributors reclaim their own funds.
              </p>
            </section>
          )}
          <section className="pot-share-example">
            <h2>See your share</h2>
            <AmountInput
              label="Example contribution"
              value={amount}
              onChange={setAmount}
            />
            <p>
              {amount && BigInt(amount) > 0n
                ? `${potOdds(amount, (100000000n + BigInt(amount)).toString())} chance after adding ${tari(amount)} TARI to an example 100-TARI pot.`
                : "Enter an amount to see how the share works."}
            </p>
            <p className="fine-print">Calculator only. Nothing is sent.</p>
          </section>
          <button
            className="pot-preview-toggle"
            disabled={busy}
            onClick={() => {
              setPreview((v) => !v);
              setReview(undefined);
              setAccepted(false);
            }}
          >
            {preview
              ? "Close fictional preview"
              : "Preview fictional contributions"}
          </button>
          <p className="fine-print">
            Rounds follow {potRules.roundEpochs} consensus epochs, approximately
            one week. Network timing can vary.
          </p>
        </aside>
      </div>
    </section>
  );
}
