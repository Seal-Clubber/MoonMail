import { useEffect, useRef, useState } from "react";
import type {
  Deployment,
  Envelope,
  Letter,
  MailMode,
  Postbox,
  SealedPayload,
  MailboxPayload,
} from "../core/types";
import {
  emptyDeployment,
  claimsReady,
  writesReady,
  postboxClaimsReady,
} from "../core/config";
import type { ConnectedWallet } from "../core/wallet";
import { SapientSession, sapientProvider } from "../core/sapient";
import { PostOfficeClient } from "../core/chain";
import { sealLetter, openLetter, assertEnvelopeSize } from "../core/crypto";
import {
  createGiftLink,
  parseGiftLink,
  sameContext,
  type LinkRoute,
} from "../core/links";
import { money } from "../core/transactions";
import { readPending, savePending } from "../core/pending";
import {
  mailboxKey,
  sealMailbox,
  envelopeMailboxContext,
} from "../core/mailbox";
import { Postboxes } from "./Postboxes";
import { networkPreset, checkPublicIndexer } from "../core/networks";

const exampleLetters: Envelope[] = [
  {
    id: "preview-1",
    mode: "public",
    context: emptyDeployment,
    payload: {
      subject: "To whoever needs a little light",
      body: "The nights are getting longer. Here is a small reminder: even a haunted house is a home to someone.\n\nLeave a little kindness behind you.\n— A wandering soul",
    },
    gift: "0",
    reserve: "0",
    claimed: false,
    sender: "Visual preview",
  },
  {
    id: "preview-2",
    mode: "link",
    context: emptyDeployment,
    payload: {
      version: "gd-link-1",
      iv: "",
      ciphertext: "",
      wrapIv: "",
      wrappedClaimKey: "",
      claimPublicKey: "",
    },
    gift: "0",
    reserve: "0",
    claimed: false,
    sender: "Visual preview",
  },
  {
    id: "preview-3",
    mode: "public",
    context: emptyDeployment,
    payload: {
      subject: "A message from the other side",
      body: "If the clerk offers you tea, say yes. If the tea offers you advice, listen carefully.\n\nWelcome to the post office between worlds.",
    },
    gift: "0",
    reserve: "0",
    claimed: false,
    sender: "Visual preview",
  },
];
const short = (v: string) =>
  v.length > 20 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v;
export function App() {
  const [view, setView] = useState("hall"),
    [d, setD] = useState<Deployment>(() => networkPreset(38)),
    [chain, setChain] = useState<PostOfficeClient>();
  const [letters, setLetters] = useState<Envelope[]>([]),
    [boxes, setBoxes] = useState<Postbox[]>([]),
    [preview, setPreview] = useState(false),
    [list, setList] = useState(false),
    [cursor, setCursor] = useState("");
  const [wallet, setWallet] = useState<ConnectedWallet>(),
    [account, setAccount] = useState(0),
    [connect, setConnect] = useState(false),
    [sapientAvailable, setSapientAvailable] = useState(!!sapientProvider());
  const [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState<Envelope>(),
    [plain, setPlain] = useState<Letter>(),
    [ghost, setGhost] = useState(false);
  const [mode, setMode] = useState<MailMode>("link"),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [gift, setGift] = useState("0"),
    [reserve, setReserve] = useState("0"),
    [fee, setFee] = useState("100000"),
    [reply, setReply] = useState(""),
    [recipient, setRecipient] = useState("");
  const [review, setReview] = useState(false),
    [prepared, setPrepared] = useState<{
      envelope: Envelope;
      capability?: string;
    }>(),
    [privateLink, setPrivateLink] = useState("");
  const [address, setAddress] = useState(""),
    [destination, setDestination] = useState(""),
    [createAccount, setCreateAccount] = useState(false),
    [destMode, setDestMode] = useState("manual"),
    [route, setRoute] = useState<LinkRoute>();
  const secret = useRef<Uint8Array | undefined>(undefined),
    routeOnce = useRef(false),
    [page, setPage] = useState(1),
    openSequence = useRef(0),
    draftSequence = useRef(0),
    readSequence = useRef(0),
    connectionSequence = useRef(0),
    retryReader = useRef<PostOfficeClient | undefined>(undefined),
    [indexerStatus, setIndexerStatus] = useState("");
  const owned = boxes.filter(
    (p) => p.controller === wallet?.accounts[account]?.account.owner_public_key,
  );
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const detected = () => setSapientAvailable(!!sapientProvider());
    window.addEventListener("tari#initialized", detected);
    window.addEventListener("tari:announceProvider", detected);
    detected();
    return () => {
      window.removeEventListener("tari#initialized", detected);
      window.removeEventListener("tari:announceProvider", detected);
    };
  }, []);
  useEffect(() => {
    if (!(wallet instanceof SapientSession)) return;
    const changed = () => {
      wallet.invalidate();
      clearWallet(false);
      setStatus(
        "Sapient account changed or site permission was removed. Reconnect to continue.",
      );
    };
    window.addEventListener("tari#accountsChanged", changed);
    return () => window.removeEventListener("tari#accountsChanged", changed);
  }, [wallet]);
  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}deployment.json`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Configuration unavailable");
        return r.json();
      })
      .then((data: Deployment) => {
        if (!cancelled) setD(data);
      })
      .catch(() => {
        if (!cancelled)
          setStatus(
            "No deployment configured. Explore the post office preview.",
          );
      });
    if (!routeOnce.current) {
      routeOnce.current = true;
      try {
        const parsed = parseGiftLink(location.hash);
        if (parsed) {
          setRoute(parsed);
          history.replaceState(
            null,
            "",
            `${location.pathname}${location.search}#/letter/${encodeURIComponent(parsed.id)}`,
          );
        } else {
          const initialView = location.hash.slice(2);
          if (
            ["hall", "compose", "postboxes", "ledger", "network"].includes(
              initialView,
            )
          )
            setView(initialView);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const sequence = ++readSequence.current;
    retryReader.current?.provider.stopWatcher();
    retryReader.current = undefined;
    if (!d.registry || !d.indexerUrl) return;
    let cancelled = false;
    let connected: PostOfficeClient | undefined;
    PostOfficeClient.connect(d)
      .then(async (c) => {
        connected = c;
        if (cancelled) {
          c.provider.stopWatcher();
          return;
        }
        const data = await c.read();
        if (!cancelled) {
          setChain(c);
          setLetters(data.letters);
          setBoxes(data.postboxes);
          setCursor(data.nextCursor);
          setStatus("Chain state loaded through your selected indexer.");
        }
      })
      .catch(() => {
        connected?.provider.stopWatcher();
        if (!cancelled)
          setError(
            "Could not read the configured post office. Check deployment identity, network, state encoding and indexer connectivity.",
          );
      });
    return () => {
      cancelled = true;
      if (readSequence.current === sequence) readSequence.current += 1;
      retryReader.current?.provider.stopWatcher();
      retryReader.current = undefined;
      connected?.provider.stopWatcher();
    };
  }, [d]);
  useEffect(() => {
    if (!route || !chain) return;
    let cancelled = false;
    void task(async () => {
      if (!sameContext(route.context, d))
        throw new Error(
          "This private link belongs to another deployment. Choose its matching trusted configuration before opening.",
        );
      const e = await chain.readLetter(route.id);
      if (!e || e.mode !== "link")
        throw new Error("Sealed letter not found in this deployment");
      const result = await openLetter(
        e.payload as SealedPayload,
        route.capability,
        d,
        e.id,
      );
      if (cancelled) {
        result.claimSecret.fill(0);
        return;
      }
      secret.current?.fill(0);
      secret.current = result.claimSecret;
      setActive(e);
      setPlain(result.letter);
      setPrivateLink(
        createGiftLink(
          new URL(import.meta.env.BASE_URL, location.href).href,
          route,
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [route, chain]);
  useEffect(
    () => () => {
      secret.current?.fill(0);
    },
    [],
  );
  useEffect(() => {
    if (!connect && !active) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>(".modal");
    const controls = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
        ) || [],
      );
    controls()[0]?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (connect) {
          connectionSequence.current += 1;
          setConnect(false);
        } else closeLetter();
      }
      if (e.key === "Tab") {
        const all = controls(),
          first = all[0],
          last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [connect, active]);
  function changeDeployment(
    change: Partial<Deployment>,
    reviewedProfile = false,
  ) {
    draftSequence.current += 1;
    if (change.network !== undefined && change.network !== d.network)
      disconnect();
    setIndexerStatus("");
    closeLetter();
    setPrepared(undefined);
    setChain(undefined);
    setLetters([]);
    setBoxes([]);
    setCursor("");
    setD({
      ...d,
      ...change,
      capsule:
        reviewedProfile ||
        (change.network !== undefined && change.network !== d.network)
          ? change.capsule
          : (change.capsule ?? d.capsule),
      postboxClaimProtocol:
        reviewedProfile ||
        (change.network !== undefined && change.network !== d.network)
          ? change.postboxClaimProtocol
          : (change.postboxClaimProtocol ?? d.postboxClaimProtocol),
      evidence: reviewedProfile
        ? change.evidence!
        : { ...emptyDeployment.evidence },
    });
  }
  async function selectOffice(file: "deployment.json" | "deployment-v2.json") {
    const response = await fetch(`${import.meta.env.BASE_URL}${file}`, {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("Reviewed post office configuration unavailable");
    const profile: Deployment = await response.json();
    if (profile.network !== 38 || !profile.registry || !profile.evidence)
      throw new Error("Unsupported post office configuration");
    changeDeployment(profile, true);
    setStatus(
      file === "deployment.json"
        ? "Original public office selected. Historical letters are preserved."
        : "Sapient postbox office selected. Use Postboxes to create or recover your inbox.",
    );
  }
  function navigate(v: string) {
    setView(v);
    setError("");
    setReview(false);
    history.replaceState(null, "", `${location.pathname}#/${v}`);
  }
  function closeLetter() {
    openSequence.current += 1;
    secret.current?.fill(0);
    secret.current = undefined;
    setActive(undefined);
    setPlain(undefined);
    setGhost(false);
    setPrivateLink("");
    setRoute(undefined);
    setCreateAccount(false);
  }
  async function refresh() {
    if (!d.registry || !d.indexerUrl) return;
    const sequence = readSequence.current;
    const letterSequence = openSequence.current;
    const reader = chain || (await PostOfficeClient.connect(d));
    let data;
    try {
      data = await reader.read();
    } catch (error) {
      if (!chain) reader.provider.stopWatcher();
      throw error;
    }
    if (sequence !== readSequence.current) {
      if (!chain) reader.provider.stopWatcher();
      return;
    }
    setChain(reader);
    if (!chain) retryReader.current = reader;
    setLetters(data.letters);
    setBoxes(data.postboxes);
    setCursor(data.nextCursor);
    setPage(1);
    setPreview(false);
    setStatus("Chain state loaded through your selected indexer.");
    if (active) {
      const updated = await reader.readLetter(active.id, active.component);
      if (
        sequence === readSequence.current &&
        letterSequence === openSequence.current
      )
        setActive(updated);
    }
  }
  async function loadMore() {
    if (!chain || !cursor) return;
    const data = await chain.read(cursor);
    setLetters((old) => [
      ...old,
      ...data.letters.filter((e) => !old.some((x) => x.id === e.id)),
    ]);
    setBoxes(data.postboxes);
    setCursor(data.nextCursor);
  }
  async function openPostbox(envelope: Envelope) {
    closeLetter();
    setActive(envelope);
    const sequence = openSequence.current;
    const owner = wallet?.accounts.find(
      (a) => a.account.owner_public_key === envelope.claimAuthority,
    );
    if (!wallet || !owner)
      throw new Error("Connect the wallet controlling this postbox");
    const payload = envelope.payload as MailboxPayload;
    if (
      !chain ||
      envelope.context.network !== chain.deployment.network ||
      envelope.context.registry !== chain.deployment.registry ||
      envelope.context.template !== chain.deployment.template
    )
      throw new Error("Choose the chain deployment containing this postbox");
    const letter =
      wallet instanceof SapientSession &&
      payload.recovery === "sapient-capsule-1"
        ? await wallet
            .capsuleMailbox((id) => chain.provider.getSubstate(id))
            .open(
              owner.account.component_address,
              envelopeMailboxContext(envelope),
              envelope.id,
              payload,
            )
        : await wallet.decryptPostbox(
            owner.account.component_address,
            envelopeMailboxContext(envelope),
            envelope.id,
            payload,
          );
    if (openSequence.current === sequence) setPlain(letter);
  }
  const shown = (preview ? exampleLetters : letters).filter(
    (e) => e.mode !== "postbox",
  );
  const current = wallet?.accounts[account];
  function clearWallet(revoke: boolean) {
    connectionSequence.current += 1;
    draftSequence.current += 1;
    openSequence.current += 1;
    if (revoke) wallet?.disconnect();
    setWallet(undefined);
    secret.current?.fill(0);
    secret.current = undefined;
    setPlain(undefined);
    setActive(undefined);
    setPrivateLink("");
    setRoute(undefined);
    setPrepared(undefined);
    setCreateAccount(false);
    setStatus(
      "Disconnected from Sapient. Private session state was cleared; manage site permissions in your wallet.",
    );
  }
  function disconnect() {
    clearWallet(true);
  }
  async function prepare() {
    const sequence = draftSequence.current;
    money(gift);
    money(reserve);
    money(fee);
    if (!subject.trim() || !body.trim())
      throw new Error("Write a subject and a message");
    const postbox =
      mode === "postbox" ? boxes.find((p) => p.id === recipient) : undefined;
    if (mode === "postbox" && !postbox)
      throw new Error("Choose a registered recipient postbox");
    const id = crypto.randomUUID();
    const sealed =
      mode === "link" ? await sealLetter({ subject, body }, d, id) : undefined;
    const key = postbox ? mailboxKey(postbox.encryptionKey) : undefined;
    const addressed =
      postbox && key
        ? await sealMailbox(
            { subject, body },
            {
              ...d,
              postbox: postbox.id,
              controller: postbox.controller,
              keyVersion: key.keyVersion,
            },
            id,
            key,
          )
        : undefined;
    const envelope: Envelope = {
      id,
      mode,
      context: d,
      payload: addressed || sealed?.payload || { subject, body },
      gift,
      reserve,
      claimed: false,
      sender: current?.account.owner_public_key || "",
      replyPostbox: reply,
      recipientPostbox: postbox?.id,
      claimAuthority: postbox?.controller,
    };
    assertEnvelopeSize(envelope);
    if (draftSequence.current !== sequence) return;
    setPrepared({ envelope, capability: sealed?.capability });
    setReview(true);
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#/hall"
          onClick={(e) => {
            e.preventDefault();
            navigate("hall");
          }}
        >
          <span className="brand-icon" aria-hidden="true">
            ✦
          </span>
          <span>
            GHOSTDROP<small>THE HAUNTED POST OFFICE</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {[
            ["hall", "The hall"],
            ["compose", "Write a letter"],
            ["postboxes", "Postboxes"],
            ["ledger", "Address ledger"],
          ].map(([v, label]) => (
            <button
              key={v}
              className={view === v ? "nav-active" : ""}
              onClick={() => navigate(v)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          className="wallet-button"
          onClick={() => (wallet ? disconnect() : setConnect(true))}
        >
          <span className={wallet ? "dot live" : "dot"} />
          {wallet ? "Disconnect wallet" : "Connect wallet"}
        </button>
      </header>
      <main>
        <div className="eyebrow">
          <span /> TARI OOTLE ·{" "}
          {d.network === 16
            ? "LOCALNET"
            : d.network === 38
              ? "ESMERALDA"
              : "IGOR"}{" "}
          TEST ASSETS <span />
        </div>
        {view === "hall" && (
          <>
            <section className="hero">
              <p className="kicker">SOME THINGS ARE BETTER LEFT UNSEALED.</p>
              <h1>
                A little mystery.
                <br />A little <em>generosity.</em>
              </h1>
              <p>
                Letters from strangers. Gifts from ghosts.
                <br />
                Welcome to the post office between worlds.
              </p>
              <button className="primary" onClick={() => navigate("compose")}>
                Write a letter <span>↗</span>
              </button>
              <div className="hero-rule">
                <span /> NO GHOSTDROP BACKEND. JUST YOU & THE CHAIN. <span />
              </div>
            </section>
            <section
              className={`hall ${list ? "list-hall" : ""}`}
              aria-label="Floating mail hall"
            >
              <div className="hall-heading">
                <div>
                  <span className="kicker">THE FLOATING HALL</span>
                  <h2>Something is waiting.</h2>
                </div>
                <div className="hall-tools">
                  <button aria-pressed={list} onClick={() => setList(!list)}>
                    {list ? "✧ Scene view" : "☷ List view"}
                  </button>
                  <button
                    onClick={() => void task(refresh)}
                    disabled={!d.registry || !d.indexerUrl || busy}
                  >
                    ↻ Refresh
                  </button>
                </div>
              </div>
              {!chain && (
                <div className="deployment-note">
                  <span className="dot" />
                  <div>
                    <strong>
                      {d.registry
                        ? "A deployed post office is configured."
                        : "The post office is awaiting deployment."}
                    </strong>
                    <p>
                      {d.registry
                        ? "Waiting for chain data. Use Refresh to retry the selected indexer."
                        : "No funded gifts are being advertised. You can explore a clearly labelled visual preview."}
                    </p>
                  </div>
                  {!d.registry && (
                    <button
                      onClick={() => {
                        setPreview(!preview);
                        setPage(1);
                      }}
                    >
                      {preview ? "Leave preview" : "Explore preview"}
                    </button>
                  )}
                </div>
              )}
              {preview && (
                <p className="preview-banner" role="status">
                  VISUAL PREVIEW · These example letters are not stored on chain
                  and contain no funded gifts.
                </p>
              )}
              <div className="scene">
                <div className="scene-moon" />
                <div className="scene-stars" aria-hidden="true">
                  ✧ · ✦ · ✧
                </div>
                <div className="ghost-clerk" aria-hidden="true">
                  <span className="ghost-eyes">● ●</span>
                  <span className="ghost-cheek">· ·</span>
                </div>
                <div className="clerk-tag">
                  <span>YOUR SPECTRAL CLERK</span>
                  <small>“Kindness travels further than you think.”</small>
                </div>
                <div className="envelope-grid">
                  {shown.slice((page - 1) * 12, page * 12).map((e, i) => (
                    <button
                      className={`envelope-card envelope-${i % 3} ${e.mode === "link" ? "sealed" : ""}`}
                      key={e.id}
                      onClick={() => {
                        setCreateAccount(false);
                        setActive(e);
                        setPlain(
                          e.mode === "public"
                            ? (e.payload as Letter)
                            : undefined,
                        );
                      }}
                    >
                      <div className="envelope-visual" aria-hidden="true">
                        <span className="wax">
                          {e.mode === "public" ? "✧" : "⌘"}
                        </span>
                        <span className="stamp">
                          GD
                          <br />✦
                        </span>
                      </div>
                      <div className="envelope-caption">
                        <span className="letter-kind">
                          {e.mode === "public"
                            ? "OPEN LETTER"
                            : "PRIVATE INVITATION"}
                        </span>
                        <h3>
                          {e.mode === "public"
                            ? (e.payload as Letter).subject
                            : "A sealed little secret"}
                        </h3>
                        <p>
                          {e.mode === "public"
                            ? "Anyone may read"
                            : "Requires its private link"}
                        </p>
                        {!preview && BigInt(e.gift) > 0n && (
                          <small>
                            {e.claimed
                              ? "Collected"
                              : e.mode === "public"
                                ? `${e.gift} µTARI gift`
                                : "Gift availability recorded on chain"}
                          </small>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                {!shown.length && (
                  <div className="empty-hall">
                    <span>✉</span>
                    <p>
                      The hall is quiet.
                      <br />
                      <small>
                        Confirmed public notes and sealed invitations will
                        appear here.
                      </small>
                    </p>
                  </div>
                )}
              </div>
              {shown.length > 12 && (
                <div className="pagination">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </button>
                  <span>Page {page}</span>
                  <button
                    disabled={page * 12 >= shown.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
              {!preview && cursor && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      if (!chain) return;
                      const data = await chain.read(cursor);
                      setLetters((existing) => [
                        ...existing,
                        ...data.letters.filter(
                          (e) => !existing.some((x) => x.id === e.id),
                        ),
                      ]);
                      setCursor(data.nextCursor);
                    })
                  }
                >
                  Load more chain mail
                </button>
              )}
              <div className="mode-legend">
                <span>✧ Public letters</span>
                <span>⌘ Sealed invitations</span>
                <span>▥ Personal postboxes</span>
              </div>
            </section>
            <section className="how-it-works">
              <div>
                <span className="number">01</span>
                <h3>Leave a little kindness</h3>
                <p>
                  Connect your Ootle wallet. Write a public note or seal a
                  letter behind a private link.
                </p>
              </div>
              <div>
                <span className="number">02</span>
                <h3>Let it find someone</h3>
                <p>
                  Public mail floats into the hall. Private links carry the
                  secret in their URL fragment.
                </p>
              </div>
              <div>
                <span className="number">03</span>
                <h3>Make their night</h3>
                <p>
                  When verified, funded gifts travel to a compatible receiving
                  account. Opening never claims.
                </p>
              </div>
            </section>
          </>
        )}
        {view === "compose" && (
          <section className="page-panel compose">
            <span className="kicker">THE WRITING DESK</span>
            <h1>
              Send something <em>unexpected.</em>
            </h1>
            <p>
              A letter can be public, sealed by a link, or addressed to a
              postbox.
            </p>
            <div className="mode-switch" role="group" aria-label="Mail mode">
              {(["public", "link", "postbox"] as const).map((m) => (
                <button
                  aria-pressed={mode === m}
                  disabled={busy}
                  className={mode === m ? "selected" : ""}
                  onClick={() => {
                    draftSequence.current += 1;
                    setMode(m);
                    setReview(false);
                    setPrepared(undefined);
                  }}
                  key={m}
                >
                  {m === "public"
                    ? "✧ Public mail"
                    : m === "link"
                      ? "⌘ Private link"
                      : "▥ To a postbox"}
                </button>
              ))}
            </div>
            {mode === "link" && (
              <p className="info">
                Anyone with the link can read the letter and collect its
                unclaimed gift, including the sender. Keep a copy: there is no
                recovery service.
              </p>
            )}
            {mode === "postbox" && (
              <p className="info">
                Addressed mail requires a registered postbox and its controlling
                wallet.{" "}
                {writesReady(d, "postbox", "sapient")
                  ? "The letter is encrypted for the selected postbox. Its controller can recover historical mail and collect gifts through Sapient."
                  : "Choose the verified Sapient postbox office in Network & verification. This office has no verified postbox recovery configuration, so addressed sending remains disabled."}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void task(prepare);
              }}
            >
              <label>
                Subject
                <input
                  value={subject}
                  disabled={busy}
                  maxLength={120}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setReview(false);
                  }}
                  placeholder="A small thought from the other side"
                  required
                />
              </label>
              <label>
                Your letter
                <textarea
                  value={body}
                  disabled={busy}
                  maxLength={2600}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setReview(false);
                  }}
                  placeholder="Dear wandering soul…"
                  rows={7}
                  required
                />
              </label>
              {mode === "postbox" && (
                <label>
                  Recipient postbox
                  <select
                    value={recipient}
                    disabled={busy}
                    onChange={(e) => {
                      setRecipient(e.target.value);
                      setReview(false);
                    }}
                  >
                    <option value="">Choose a registered postbox</option>
                    {boxes
                      .filter((p) => p.discoverable)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nickname} · {short(p.id)}
                        </option>
                      ))}
                  </select>
                  <input
                    aria-label="Recipient postbox ID"
                    value={recipient}
                    onChange={(e) => {
                      setRecipient(e.target.value);
                      setReview(false);
                    }}
                    placeholder="Or paste a registered ID, including an unlisted postbox"
                    disabled={busy}
                  />
                </label>
              )}
              <div className="form-row">
                <label>
                  Gift · whole µTARI
                  <input
                    inputMode="numeric"
                    value={gift}
                    disabled={busy}
                    onChange={(e) => {
                      setGift(e.target.value);
                      setReview(false);
                    }}
                  />
                </label>
                <label>
                  Extra collection-fee reserve · µTARI
                  <input
                    inputMode="numeric"
                    value={reserve}
                    disabled={busy}
                    onChange={(e) => {
                      setReserve(e.target.value);
                      setReview(false);
                    }}
                  />
                </label>
              </div>
              <p className="fine-print">
                Short letters only: the complete serialized envelope must fit
                within 4 KiB. No expiry or refunds. Unused collection reserve
                remains locked in the envelope vault.
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!reply}
                  disabled={busy || !owned.length}
                  onChange={(e) =>
                    setReply(e.target.checked ? owned[0]?.id || "" : "")
                  }
                />{" "}
                Include my postbox for replies (optional)
              </label>
              {reply && (
                <label>
                  Verified owned reply postbox
                  <select
                    value={reply}
                    disabled={busy}
                    onChange={(e) => setReply(e.target.value)}
                  >
                    {owned.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nickname} · {short(p.id)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {wallet && (
                <label>
                  Funding account
                  <select
                    value={account}
                    disabled={busy}
                    onChange={(e) => {
                      setAccount(Number(e.target.value));
                      setReview(false);
                      setReply("");
                    }}
                  >
                    {wallet.accounts.map((a, i) => (
                      <option key={i} value={i}>
                        {a.account.name} · {short(a.account.component_address)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Publication-fee cap · µTARI
                <input
                  value={fee}
                  disabled={busy}
                  inputMode="numeric"
                  onChange={(e) => {
                    setFee(e.target.value);
                    setReview(false);
                  }}
                />
              </label>
              {wallet?.kind === "sapient" && (
                <p className="fine-print">
                  This cap applies to each transaction. Sapient may retry input
                  or version failures; more than one attempt can pay fees. An
                  uncertain operation stays pending until you reconcile it.
                </p>
              )}
              <div className="actions">
                <button
                  type="submit"
                  className="primary"
                  disabled={
                    busy || (mode === "postbox" && (!recipient || !d.registry))
                  }
                >
                  {busy ? "Sealing…" : "Review letter"} <span>↗</span>
                </button>
                {!wallet && (
                  <button type="button" onClick={() => setConnect(true)}>
                    Connect to send
                  </button>
                )}
              </div>
            </form>
            {review && prepared && (
              <div className="review">
                <h2>
                  {mode === "link"
                    ? "Sealed on this device"
                    : "Ready for review"}
                </h2>
                <p>
                  Gift: {gift} µTARI · Collection reserve: {reserve} µTARI ·
                  Publication cap: {fee} µTARI.
                </p>
                <p>
                  Recipient payout: {gift} µTARI, if the independently funded
                  reserve covers execution. Sapient estimates this draft's
                  publication fees before requesting approval.
                </p>
                <p className="fine-print">
                  Nothing has been published or funded yet. Encryption includes
                  the subject. Private gift amounts and routing metadata remain
                  visible on chain.
                </p>
                {prepared.capability && d.registry && (
                  <button
                    onClick={() =>
                      void task(async () => {
                        const link = createGiftLink(
                          new URL(import.meta.env.BASE_URL, location.href).href,
                          {
                            id: prepared.envelope.id,
                            capability: prepared.capability!,
                            context: d,
                          },
                        );
                        await navigator.clipboard.writeText(link);
                        setStatus(
                          "Copied a pending private link. It will open only after publication confirms. Keep it: refreshing can lose the in-memory capability.",
                        );
                      })
                    }
                  >
                    Save pending private link
                  </button>
                )}
                <button
                  className="primary"
                  disabled={
                    !wallet ||
                    !chain ||
                    !writesReady(d, mode, "sapient") ||
                    busy
                  }
                  onClick={() =>
                    void task(async () => {
                      if (!wallet || !chain || !current) return;
                      const id = await chain.publish(
                        wallet,
                        current,
                        prepared.envelope,
                        fee,
                        localStorage,
                      );
                      setStatus(
                        `Submitted ${id}. Reconcile confirmation before generating a share link.`,
                      );
                    })
                  }
                >
                  Fund & publish letter
                </button>
                {!writesReady(d, mode, "sapient") && (
                  <p className="info">
                    Sending is gated until local engine claims, guest delivery,
                    Sapient signing and confirmation are verified.
                  </p>
                )}
              </div>
            )}
          </section>
        )}
        {view === "postboxes" && (
          <Postboxes
            wallet={wallet}
            chain={chain}
            deployment={d}
            boxes={boxes}
            letters={letters}
            busy={busy}
            task={task}
            onStatus={setStatus}
            onConnect={() => setConnect(true)}
            onOpen={(e) => void task(() => openPostbox(e))}
            onRefresh={refresh}
            onMore={loadMore}
            hasMore={!!cursor}
          />
        )}
        {view === "ledger" && (
          <section className="page-panel">
            <span className="kicker">THE ADDRESS LEDGER</span>
            <h1>
              Find a <em>familiar spirit.</em>
            </h1>
            <p>
              Discoverable postboxes from the selected chain state. Duplicate
              nicknames are distinguished by their stable IDs.
            </p>
            {boxes.filter((p) => p.discoverable).length ? (
              <table>
                <thead>
                  <tr>
                    <th>Nickname</th>
                    <th>Postbox ID</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes
                    .filter((p) => p.discoverable)
                    .map((p) => (
                      <tr key={p.id}>
                        <td>{p.nickname}</td>
                        <td>
                          <code>{p.id}</code>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div className="quiet-state">No registered postboxes loaded.</div>
            )}
          </section>
        )}
        {view === "network" && (
          <section className="page-panel">
            <span className="kicker">INFRASTRUCTURE & EVIDENCE</span>
            <h1>
              Your <em>post office.</em>
            </h1>
            <p>
              Static hosting, a replaceable Ootle indexer, and your Sapient
              wallet. No GhostDrop server.
            </p>
            <h2>Esmeralda post offices</h2>
            <p>
              The original office keeps its public letters and private links.
              The new office supports Sapient postboxes, restored-wallet
              recovery and gift-funded collection. Choose the office containing
              your mail; reloading returns to the original office.
            </p>
            <div className="actions">
              <button
                disabled={busy}
                onClick={() => void task(() => selectOffice("deployment.json"))}
              >
                Use original public office
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void task(() => selectOffice("deployment-v2.json"))
                }
              >
                Use Sapient postbox office
              </button>
            </div>
            <label>
              Ootle test network
              <select
                disabled={busy}
                value={d.network}
                onChange={(e) =>
                  changeDeployment(networkPreset(Number(e.target.value)))
                }
              >
                <option value={38}>Esmeralda · public testnet</option>
                <option value={36}>Igor · custom testnet endpoint</option>
                <option value={16}>Localnet · your local indexer</option>
              </select>
            </label>
            <label>
              Indexer endpoint
              <input
                value={d.indexerUrl}
                disabled={busy}
                onChange={(e) =>
                  changeDeployment({ indexerUrl: e.target.value })
                }
                placeholder="HTTPS indexer URL"
              />
            </label>
            <label>
              Test asset resource
              <input
                disabled={busy}
                value={d.resource}
                onChange={(e) => changeDeployment({ resource: e.target.value })}
              />
            </label>
            <div className="actions">
              <button
                disabled={busy || !d.indexerUrl}
                onClick={() =>
                  void task(async () => {
                    setIndexerStatus("");
                    const result = await checkPublicIndexer(d);
                    setIndexerStatus(
                      `Connected to ${result.network} · epoch ${result.epoch} · indexer ${result.version} · asset ${result.symbol}. No wallet or transaction was used.`,
                    );
                  })
                }
              >
                Check indexer connection
              </button>
              <a
                href="https://ootle.tari.com/"
                target="_blank"
                rel="noreferrer"
              >
                Ootle documentation ↗
              </a>
            </div>
            {indexerStatus && <p role="status">{indexerStatus}</p>}
            {!d.registry && (
              <p className="info">
                Public network settings are ready to check. GhostDrop still
                needs its own deployed registry and two template addresses
                before live mail can load. Addresses from a local test chain do
                not work on the public testnet.
              </p>
            )}
            <label>
              Registry component
              <input
                value={d.registry}
                disabled={busy}
                onChange={(e) => changeDeployment({ registry: e.target.value })}
              />
            </label>
            <label>
              Registry template identity
              <input
                value={d.template}
                disabled={busy}
                onChange={(e) => changeDeployment({ template: e.target.value })}
              />
            </label>
            <label>
              Envelope template identity
              <input
                value={d.envelopeTemplate}
                disabled={busy}
                onChange={(e) =>
                  changeDeployment({ envelopeTemplate: e.target.value })
                }
              />
            </label>
            <p className="info">
              Configure and review public/deployment.json to enable a verified
              deployment. Link secrets and API keys never belong there. Indexer
              responses are trusted infrastructure; this client does not verify
              consensus proofs.
            </p>
            <h2>Required evidence</h2>
            <ul className="evidence-list">
              {Object.entries(d.evidence).map(([k, v]) => (
                <li key={k}>
                  <span className={v ? "evidence-yes" : "evidence-no"}>
                    {v ? "✓" : "○"}
                  </span>
                  {k}: {v ? "recorded by deployer" : "unverified"}
                </li>
              ))}
            </ul>
            <h2>Pending transactions</h2>
            {readPending(localStorage)
              .filter(
                (p) => p.network === d.network && p.registry === d.registry,
              )
              .map((p) => (
                <div className="pending" key={p.id}>
                  <code>{short(p.id)}</code>
                  <span>
                    {p.operation} · {p.state}
                  </span>
                  <button
                    disabled={!chain || busy}
                    onClick={() =>
                      void task(async () => {
                        if (!chain) return;
                        if (p.id.startsWith("attempt:")) {
                          if (
                            p.operation === "postbox" ||
                            p.operation === "capsule"
                          ) {
                            setStatus(
                              "This wallet submission has no transaction ID. Inspect the controlling wallet's transaction history before resolving it; matching postbox state alone cannot identify the submitted transaction. Retrying remains blocked.",
                            );
                            return;
                          }
                          const e = await chain.readLetter(p.envelopeId);
                          if (p.operation === "publish" || e.claimed) {
                            savePending(localStorage, {
                              ...p,
                              state: "confirmed",
                            });
                            await refresh();
                            setStatus(
                              "Envelope state confirms delivery/publication. For missing or ambiguous attempts inspect donor/account history before retrying.",
                            );
                          }
                          return;
                        }
                        const outcome = await chain.reconcile(p.id);
                        const state = !outcome
                          ? "unknown"
                          : outcome.outcome === "Commit"
                            ? "confirmed"
                            : outcome.outcome === "FeeIntentCommit"
                              ? "unknown"
                              : "rejected";
                        savePending(localStorage, { ...p, state });
                        await refresh();
                        setStatus(`Transaction ${short(p.id)}: ${state}.`);
                        if (
                          prepared?.envelope.id === p.envelopeId &&
                          state === "confirmed" &&
                          prepared.capability
                        ) {
                          const r = {
                            id: p.envelopeId,
                            capability: prepared.capability,
                            context: d,
                          };
                          setPrivateLink(
                            createGiftLink(
                              new URL(import.meta.env.BASE_URL, location.href)
                                .href,
                              r,
                            ),
                          );
                        }
                      })
                    }
                  >
                    Reconcile
                  </button>
                  {p.walletRequest && p.state === "unknown" && (
                    <button
                      disabled={busy || !(wallet instanceof SapientSession)}
                      onClick={() =>
                        void task(async () => {
                          if (!(wallet instanceof SapientSession)) return;
                          const id = await wallet.resume(p.id, localStorage);
                          setStatus(
                            `Sapient submission ${id}. Reconcile chain confirmation next.`,
                          );
                        })
                      }
                    >
                      Resume Sapient approval
                    </button>
                  )}
                </div>
              ))}
            {privateLink && (
              <label>
                Confirmed private link
                <textarea readOnly value={privateLink} />
                <button
                  onClick={() =>
                    void navigator.clipboard.writeText(privateLink)
                  }
                >
                  Copy private link
                </button>
              </label>
            )}
          </section>
        )}
        {error && (
          <div role="alert" className="message error">
            {error}
          </div>
        )}
        {status && (
          <div role="status" className="message status">
            {status}
          </div>
        )}
      </main>
      <footer>
        <span className="footer-brand">✦ GHOSTDROP</span>
        <p>Made for the generous souls among us.</p>
        <button onClick={() => navigate("network")}>
          Network & verification ↗
        </button>
        <span className="footer-note">TEST ASSETS ONLY · AUDIO OFF</span>
      </footer>
      {connect && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-title"
          >
            <button
              className="close"
              aria-label="Close wallet connection"
              onClick={() => {
                connectionSequence.current += 1;
                setConnect(false);
              }}
            >
              ×
            </button>
            <span className="kicker">YOUR SAPIENT WALLET</span>
            <h2 id="wallet-title">Connect Sapient</h2>
            <p>
              Approve GhostDrop in Sapient. Your wallet holds your keys and asks
              you to approve each transaction. No daemon URL, API key or file
              import is needed.
            </p>
            <details>
              <summary>What do I need?</summary>
              <p className="fine-print">
                Sapient is the wallet itself. Open GhostDrop in the browser
                where you use Sapient, unlock it, and choose your Ootle account.
                There is no separate GhostDrop bridge or background program.
              </p>
              <p className="fine-print">
                Public mail and private-link mail open without a wallet. Sending
                requires a wallet to sign and pay fees. Postbox key recovery is
                being verified separately for Sapient; existing mail keys have
                been preserved. Unsupported deployment actions stay disabled.
              </p>
            </details>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void task(async () => {
                  const sequence = ++connectionSequence.current;
                  const w = await SapientSession.connect(d.network);
                  if (sequence !== connectionSequence.current) {
                    w.invalidate();
                    return;
                  }
                  if (wallet instanceof SapientSession) wallet.invalidate();
                  else wallet?.disconnect();
                  setWallet(w);
                  setAccount(0);
                  setConnect(false);
                  setStatus(
                    "Connected to Sapient. Transactions require your wallet approval.",
                  );
                });
              }}
            >
              <p role="status">
                {sapientAvailable
                  ? "Sapient detected in this browser."
                  : "Sapient has not been detected in this browser."}
              </p>
              {!sapientAvailable && (
                <a
                  href="https://sapient.tari.mw/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get Sapient wallet ↗
                </a>
              )}
              <p className="fine-print">
                Switch accounts in Sapient. If you change its account or
                network, reconnect here. Disconnect clears private page state.
              </p>
              <button className="primary" disabled={busy}>
                {busy ? "Connecting…" : "Connect Sapient"}
              </button>
            </form>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
      {active && (
        <div className="modal-backdrop">
          <section
            className="modal letter-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="letter-title"
          >
            <button
              className="close"
              aria-label="Close letter"
              onClick={closeLetter}
            >
              ×
            </button>
            <span className="kicker">
              {preview
                ? "VISUAL PREVIEW"
                : active.mode === "public"
                  ? "PUBLIC LETTER"
                  : "SEALED INVITATION"}
            </span>
            <h2 id="letter-title">
              {plain?.subject || "A sealed little secret"}
            </h2>
            {plain ? (
              <p className="letter-body">{plain.body}</p>
            ) : (
              <div className="sealed-state">
                <span>⌘</span>
                <p>
                  {active.mode === "postbox"
                    ? "This letter is sealed to its postbox. Connect the controlling wallet and use its account-scoped decrypt permission to open it."
                    : "This letter is sealed. Only its complete private link can unlock its subject and contents."}
                </p>
              </div>
            )}
            <button aria-pressed={ghost} onClick={() => setGhost(!ghost)}>
              ◈ Ghost View
            </button>
            {ghost && (
              <div className="ghost-view">
                <h3>{preview ? "Example payload" : "Stored chain payload"}</h3>
                <pre>{JSON.stringify(active.payload, null, 2)}</pre>
                <p>
                  Encryption hides the subject and body of sealed mail. This
                  implementation uses revealed test TARI: amounts,
                  sender/controller keys, timing and routing remain observable.
                  Ghost View does not provide payment anonymity.
                </p>
              </div>
            )}
            {privateLink && (
              <button
                onClick={() => void navigator.clipboard.writeText(privateLink)}
              >
                Copy private link
              </button>
            )}
            {!preview && BigInt(active.gift) > 0n && (
              <div className="claim-panel">
                <h3>
                  {active.claimed ? "Gift delivered" : "Collect the gift"}
                </h3>
                <p>
                  Gift {active.gift} µTARI · Extra reserve {active.reserve}{" "}
                  µTARI · Expected payout {active.gift} µTARI.
                </p>
                {!active.claimed && (
                  <>
                    <div className="mode-switch">
                      <button
                        disabled={busy}
                        aria-pressed={destMode === "manual"}
                        onClick={() => {
                          setDestMode("manual");
                          setAddress("");
                          setDestination("");
                        }}
                      >
                        Use another address
                      </button>
                      <button
                        disabled={busy || !wallet}
                        aria-pressed={destMode === "wallet"}
                        onClick={() => {
                          setDestMode("wallet");
                          setCreateAccount(false);
                          if (current) {
                            setAddress(current.address);
                            setDestination(current.account.component_address);
                          }
                        }}
                      >
                        Choose from connected wallet
                      </button>
                    </div>
                    {destMode === "wallet" && wallet && (
                      <label>
                        Receiving account
                        <select
                          disabled={busy}
                          onChange={(e) => {
                            const a = wallet.accounts[Number(e.target.value)];
                            setAddress(a.address);
                            setDestination(a.account.component_address);
                          }}
                          defaultValue={account}
                        >
                          {wallet.accounts.map((a, i) => (
                            <option key={i} value={i}>
                              {a.account.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {destMode === "manual" && (
                      <>
                        <label>
                          Ootle receiving address
                          <input
                            disabled={busy}
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                          />
                        </label>
                        {active.mode !== "postbox" && (
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={createAccount}
                              disabled={busy || !claimsReady(d, true)}
                              onChange={(e) => {
                                setCreateAccount(e.target.checked);
                                setDestination("");
                              }}
                            />
                            Create a new receiving account
                          </label>
                        )}
                        {!createAccount && (
                          <label>
                            Existing built-in account component
                            <input
                              disabled={busy}
                              value={destination}
                              onChange={(e) => setDestination(e.target.value)}
                            />
                          </label>
                        )}
                      </>
                    )}
                    <p className="fine-print">
                      {active.mode === "postbox" &&
                      wallet?.kind === "sapient" &&
                      active.claimProtocol === "sapient-proof-1" &&
                      postboxClaimsReady(d, "sapient")
                        ? `Sapient will ask you to approve a proof for this gift and destination. GhostDrop then submits the claim. You receive ${active.gift} µTARI; collection fees come from the funded reserve of up to ${active.reserve} µTARI. Your wallet needs no coins for this claim. The approval expires after at most 10 network epochs.`
                        : active.mode === "postbox" &&
                            wallet?.kind === "sapient"
                          ? "Postbox collection is not enabled for this deployment. Your connected wallet must control this postbox."
                          : createAccount
                            ? "Use an Ootle address whose built-in account does not exist yet. The gift reserve pays account creation and collection fees; your receiving keys stay in your wallet."
                            : "Guests may use an existing compatible account without connecting its wallet. L1 XTM addresses, raw keys and arbitrary components are unsupported."}
                    </p>
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        !chain ||
                        !(active.mode === "postbox"
                          ? postboxClaimsReady(d, wallet?.kind ?? "sapient")
                          : claimsReady(d, createAccount)) ||
                        (active.mode === "postbox" &&
                          !wallet?.accounts.some(
                            (a) =>
                              a.account.owner_public_key ===
                              active.claimAuthority,
                          )) ||
                        (active.mode === "link" && !secret.current)
                      }
                      onClick={() =>
                        void task(async () => {
                          if (!chain) return;
                          const owner = wallet?.accounts.find(
                            (a) =>
                              a.account.owner_public_key ===
                              active.claimAuthority,
                          );
                          const id =
                            active.mode === "postbox" && wallet && owner
                              ? await chain.claimPostbox(
                                  wallet,
                                  owner,
                                  active,
                                  address,
                                  destination,
                                  localStorage,
                                )
                              : await chain.claim(
                                  active,
                                  address,
                                  destination,
                                  secret.current,
                                  localStorage,
                                  createAccount,
                                );
                          setStatus(
                            `Claim submitted ${id}. Verify delivery through Network & verification.`,
                          );
                        })
                      }
                    >
                      Review address & explicitly claim
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
