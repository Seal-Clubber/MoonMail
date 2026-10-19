import { FeeLimitError, type FeeProblem } from "../core/fee-limit";
import { FeeAdjustment } from "./FeeAdjustment";
import { letterLimit, unifiedOffice } from "../core/config";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GhostMark } from "./GhostMark";
import { UiIcon } from "./UiIcon";
import { Landing } from "./Landing";
import { PublicMailCard } from "./PublicMailCard";
import { PublicMailFilters } from "./PublicMailFilters";
import { PrivacyView } from "./PrivacyView";
import { ActivityBook } from "./ActivityBook";
import { MoonPot } from "./MoonPot";
import {
  publicSampleMail as sampleMail,
  sampleLetter,
  sampleActivity,
  filterSampleMail,
  type SampleMailFilter,
} from "./sample-office";
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
import { replyThread } from "../core/threads";
import type { ReplyThread } from "../core/types";
import { recipientGroups } from "../core/contacts";
import type { MailboxPreferences } from "../core/mailbox-state";
import { draftEnvelopeSize } from "../core/letter-size";
import {
  createGiftLink,
  parseGiftLink,
  sameContext,
  type LinkRoute,
} from "../core/links";
import { money } from "../core/transactions";
import {
  readPending,
  savePending,
  inspectPending,
  pendingIsUnresolved,
  type Pending,
} from "../core/pending";
import { readDelivery } from "../core/delivery";
import { browserStorage, checkBrowserStorage } from "../core/browser-storage";
import { filterHallMail } from "../core/mail-search";
import {
  mailboxKey,
  sealMailbox,
  envelopeMailboxContext,
} from "../core/mailbox";
import {
  addSentCopy,
  sentCopy,
  sentContext,
  sentPurpose,
} from "../core/sent-mail";
import { Postboxes } from "./Postboxes";
import { ComposerContacts } from "./ComposerContacts";
import { RecipientPicker } from "./RecipientPicker";
import {
  usePendingMailboxChanges,
  clearMailboxSession,
} from "./useChainMailbox";
import { AmountInput, tari } from "./AmountInput";
import { CopyField } from "./CopyField";
import { WalletFunds } from "./WalletFunds";
import { WalletConnection } from "./WalletConnection";
import { PostboxInvitation } from "./PostboxInvitation";
import {
  createPublicLetterLink,
  parsePublicLetterLink,
  type PublicLetterRoute,
} from "../core/public-letter-links";
import { parsePostboxLink, type PostboxRoute } from "../core/postbox-links";
import { MailReadNotice } from "./MailReadNotice";
import { networkPreset, checkPublicIndexer } from "../core/networks";
import { loadOfficeProfile } from "../core/office-profile";
import { useActionFocus } from "./useActionFocus";
import { SealedMailboxSession } from "../core/sealed-mailbox";
import {
  recoveredSealedEnvelope,
  preserveSealedViews,
  verifySealedPublication,
} from "../core/sealed-view";
import { PrivateInboxAccess } from "./PrivateInboxAccess";
import { PrivatePaymentCard } from "./PrivatePaymentCard";
import { privatePaymentClient } from "../core/private-payment-client";
import { privateTari } from "../core/private-payment";
import { hex } from "../core/crypto";

const short = (v: string) =>
  v.length > 20 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v;
export function App() {
  const [mailboxSearchTarget, setMailboxSearchTarget] =
    useState<HTMLDivElement | null>(null);
  const restoreBlocked = useRef(false);
  const [officeLoadError, setOfficeLoadError] = useState(false);
  const hallRange = useRef<HTMLParagraphElement>(null);
  const deploymentRevision = useRef(0);
  const initialOfficePending = useRef(true);
  const [view, setView] = useState("welcome"),
    [d, setD] = useState<Deployment>(() => networkPreset(38)),
    [chain, setChain] = useState<PostOfficeClient>();
  const mailboxView = view === "postboxes" || view === "compose";
  const [composerMinimized, setComposerMinimized] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const composerReturnFocus = useRef<HTMLElement | null>(null);
  const [letters, setLetters] = useState<Envelope[]>([]),
    [boxes, setBoxes] = useState<Postbox[]>([]),
    [preview, setPreview] = useState(false),
    [list, setList] = useState(false),
    [cursor, setCursor] = useState(""),
    [loadingMore, setLoadingMore] = useState(false),
    [readState, setReadState] = useState<
      "idle" | "loading" | "ready" | "failed"
    >("idle"),
    [unavailableLetterIds, setUnavailableLetterIds] = useState<string[]>([]);
  const [wallet, setWallet] = useState<ConnectedWallet>(),
    [account, setAccount] = useState(0),
    [connect, setConnect] = useState(false),
    [sapientAvailable, setSapientAvailable] = useState(!!sapientProvider());
  const pendingMailboxChanges = usePendingMailboxChanges(wallet, d);
  useEffect(
    () => () => clearMailboxSession(wallet, d),
    [wallet, d.network, d.registry, d.template],
  );
  const [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [taskBusy, setBusy] = useState(false),
    [active, setActive] = useState<Envelope>(),
    [plain, setPlain] = useState<Letter>(),
    [ghost, setGhost] = useState(false);
  const [mailboxPlain, setMailboxPlain] = useState<Map<string, Letter>>(
    () => new Map(),
  );
  const [sentPlain, setSentPlain] = useState<Map<string, Letter>>(
    () => new Map(),
  );
  const [saveSent, setSaveSent] = useState(true);
  const sealedSessions = useRef(new Map<string, SealedMailboxSession>());
  const sealedOpening = useRef(
    new Map<string, Promise<SealedMailboxSession>>(),
  );
  const [sealedProgress, setSealedProgress] = useState(
    new Map<
      string,
      { complete: boolean; loaded: number; unavailableIds: string[] }
    >(),
  );
  const [composeViewApproved, setComposeViewApproved] = useState(false);
  const [privateAccessRevision, setPrivateAccessRevision] = useState(0);
  const privateReplies = true;
  const [requestPayment, setRequestPayment] = useState(false);
  const [requestedAmount, setRequestedAmount] = useState("100000");
  const [requestNonce, setRequestNonce] = useState(() =>
    hex(crypto.getRandomValues(new Uint8Array(32))),
  );
  const [paymentReview, setPaymentReview] = useState<string>();
  const [paymentFee, setPaymentFee] = useState("30000");
  const [paymentNotice, setPaymentNotice] = useState("");
  const privatePaymentsEnabled =
    d.contractProtocol === "unified-2" &&
    d.evidence.nativePrivatePayments === true;
  useEffect(() => {
    setComposeViewApproved(false);
    setSealedProgress(new Map());
    return () => {
      for (const session of sealedSessions.current.values()) session.dispose();
      sealedSessions.current.clear();
      sealedOpening.current.clear();
    };
  }, [wallet, d.network, d.registry, d.template]);
  useEffect(() => {
    setPaymentReview(undefined);
    setPaymentNotice("");
  }, [
    wallet,
    d.network,
    d.registry,
    d.template,
    active?.id,
    privateAccessRevision,
  ]);
  const [postage, setPostage] = useState<"private" | "transparent">(
    "transparent",
  );
  useEffect(() => {
    setPostage(
      wallet instanceof SapientSession &&
        wallet.privateFeeCapable &&
        d.evidence.nativePrivatePostage === true
        ? "private"
        : "transparent",
    );
    setReview(false);
  }, [wallet, d.evidence.nativePrivatePostage]);
  const [mailboxPreferences, setMailboxPreferences] = useState<
    Map<string, MailboxPreferences>
  >(() => new Map());
  const rememberPreferences = useCallback(
    (id: string, p: MailboxPreferences) =>
      setMailboxPreferences((old) => new Map(old).set(id, p)),
    [],
  );
  const [mailboxReaderTarget, setMailboxReaderTarget] =
    useState<HTMLDivElement | null>(null);
  const inlinePostboxReader = mailboxView && active?.mode === "postbox";
  const activeSample = !!active && sampleMail.includes(active);
  const [showSampleActivity, setShowSampleActivity] = useState(false);
  useEffect(() => {
    setMailboxPlain(new Map());
    setSentPlain(new Map());
    setThread(undefined);
    setMailboxPreferences(new Map());
  }, [wallet, d.network, d.registry, d.template]);

  const [mode, setMode] = useState<MailMode>("postbox"),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [thread, setThread] = useState<ReplyThread>(),
    [gift, setGift] = useState("0"),
    [reserve, setReserve] = useState("0"),
    [fee, setFee] = useState("100000"),
    [reply, setReply] = useState(""),
    [recipient, setRecipient] = useState(""),
    [directoryQuery, setDirectoryQuery] = useState("");
  const sealedCompose =
    d.contractProtocol === "unified-2" && mode === "postbox";
  useEffect(() => {
    setComposeViewApproved(false);
  }, [reply, wallet]);
  useEffect(() => {
    if (sealedCompose) {
      setGift("0");
      setReserve("0");
      setReview(false);
    }
  }, [sealedCompose]);
  const [mailQuery, setMailQuery] = useState(""),
    [mailFilter, setMailFilter] = useState<SampleMailFilter>("all");
  const [publicConfirmed, setPublicConfirmed] = useState(false);
  useEffect(
    () => setPublicConfirmed(false),
    [mode, subject, body, gift, reserve, recipient, reply],
  );
  const [review, setReview] = useState(false),
    [prepared, setPrepared] = useState<{
      envelope: Envelope;
      draftSnapshot: string;
      capability?: string;
      sealedReview?: Awaited<ReturnType<SealedMailboxSession["prepare"]>>;
    }>(),
    [privateLink, setPrivateLink] = useState(""),
    [linkSaved, setLinkSaved] = useState(false),
    [, setDeliveryRevision] = useState(0),
    [autoChecking, setAutoChecking] = useState(false);
  const [address, setAddress] = useState(""),
    [destination, setDestination] = useState(""),
    [destMode, setDestMode] = useState("manual"),
    [route, setRoute] = useState<LinkRoute>();
  const [postboxInvitation, setPostboxInvitation] = useState<PostboxRoute>();
  const [publicLetterRoute, setPublicLetterRoute] =
    useState<PublicLetterRoute>();
  const [publicLetterState, setPublicLetterState] = useState<
    "idle" | "opening" | "failed"
  >("idle");
  const [publicLetterError, setPublicLetterError] = useState("");
  const [publicLetterRevision, setPublicLetterRevision] = useState(0);
  const [linkState, setLinkState] = useState<"idle" | "opening" | "failed">(
      "idle",
    ),
    [linkError, setLinkError] = useState(""),
    [linkRevision, setLinkRevision] = useState(0);
  const busy =
    taskBusy || linkState === "opening" || publicLetterState === "opening";
  const modalBusy = useRef(busy);
  const modalReturnFocus = useRef<HTMLElement | null>(null);
  const focusAddressedDraft = useRef(false);
  const focusActivity = useRef(false);
  modalBusy.current = busy;
  useEffect(() => {
    if (!focusAddressedDraft.current || view !== "compose" || postboxInvitation)
      return;
    focusAddressedDraft.current = false;
    document
      .getElementById("writing-desk-title")
      ?.focus({ preventScroll: true });
  }, [view, postboxInvitation, active?.id]);
  useEffect(() => {
    if (!focusActivity.current || view !== "activity" || active) return;
    focusActivity.current = false;
    document.getElementById("activity-title")?.focus({ preventScroll: true });
  }, [view, active?.id]);
  const [checkingGift, setCheckingGift] = useState(false);
  const [claimReview, setClaimReview] = useState<{
    address: string;
    destination: string;
    createAccount: boolean;
  }>();
  const collectionFocus = useActionFocus(busy, !!error && !!claimReview);
  const inboxFocus = useActionFocus(
    busy,
    !!error && active?.mode === "postbox" && !plain,
  );
  const secret = useRef<Uint8Array | undefined>(undefined),
    routeOnce = useRef(false),
    claimReviewWasOpen = useRef(false),
    claimReviewTrigger = useRef<HTMLButtonElement>(null),
    [page, setPage] = useState(1),
    openSequence = useRef(0),
    draftSequence = useRef(0),
    currentDraftSnapshot = useRef(""),
    readSequence = useRef(0),
    connectionSequence = useRef(0),
    retryReader = useRef<PostOfficeClient | undefined>(undefined),
    [indexerStatus, setIndexerStatus] = useState("");
  const [storageError, setStorageError] = useState(() => checkBrowserStorage());
  const [storageRevision, setStorageRevision] = useState(0);
  const deliveryHistory = inspectPending(browserStorage);
  const writeBlocked = !!storageError || !!deliveryHistory.error;
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== null && event.key !== "ghostdrop:pending:v1") return;
      setStorageError(checkBrowserStorage());
      setStorageRevision((value) => value + 1);
      setDeliveryRevision((value) => value + 1);
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  const deliveries = deliveryHistory.records.filter(
    (p) => p.network === d.network && p.registry === d.registry,
  );
  const collectionPending = deliveries.some(
    (p) =>
      p.operation === "claim" &&
      p.envelopeId === active?.id &&
      pendingIsUnresolved(p),
  );
  const owned = boxes.filter(
    (p) => p.controller === wallet?.accounts[account]?.account.owner_public_key,
  );
  const [feeProblem, setFeeProblem] = useState<FeeProblem>();
  useEffect(() => {
    setFeeProblem(undefined);
  }, [
    wallet,
    d.network,
    d.registry,
    d.template,
    active?.id,
    privateAccessRevision,
  ]);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setFeeProblem(undefined);
    try {
      await fn();
    } catch (e) {
      if (e instanceof FeeLimitError) setFeeProblem(e.problem);
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const detected = () => setSapientAvailable(!!sapientProvider());
    window.addEventListener("tari#initialized", detected);
    window.addEventListener("tari:announceProvider", detected);
    window.addEventListener("focus", detected);
    detected();
    return () => {
      window.removeEventListener("tari#initialized", detected);
      window.removeEventListener("tari:announceProvider", detected);
      window.removeEventListener("focus", detected);
    };
  }, []);
  useEffect(() => {
    if (wallet || !sapientAvailable || restoreBlocked.current) return;
    try {
      if (
        sessionStorage.getItem("ghostdrop:sapient-resume:v1") !==
        String(d.network)
      )
        return;
    } catch {
      return;
    }
    let cancelled = false;
    const sequence = connectionSequence.current;
    void SapientSession.resumeAuthorized(d.network)
      .then((restored) => {
        if (!restored) return;
        if (cancelled || sequence !== connectionSequence.current) {
          restored.invalidate();
          return;
        }
        setWallet(restored);
        setAccount(0);
        setStatus(
          "Sapient connection restored. Your wallet still approves every transaction.",
        );
      })
      .catch(() => {
        // Locked wallets and removed grants remain disconnected; reconnect explicitly.
      });
    return () => {
      cancelled = true;
    };
  }, [d.network, sapientAvailable, wallet]);
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
    const revision = deploymentRevision.current;
    loadOfficeProfile(`${import.meta.env.BASE_URL}deployment.json`)
      .then((data) => {
        if (!cancelled && revision === deploymentRevision.current) {
          initialOfficePending.current = false;
          setD(data);
        }
      })
      .catch(() => {
        if (!cancelled && revision === deploymentRevision.current)
          setOfficeLoadError(true);
      });
    const readHash = () => {
      closeLetter();
      setError("");
      setPublicConfirmed(false);
      setPostboxInvitation(undefined);
      const hash = location.hash;
      const privateLink = hash === "#/letter" || hash.startsWith("#/letter/");
      let scrubbed = false;
      try {
        // Scrub the untrusted fragment before validation can reject a damaged link.
        if (privateLink) {
          history.replaceState(
            null,
            "",
            `${location.pathname}${location.search}#/letter`,
          );
          scrubbed = true;
        }
        const parsed = parseGiftLink(hash);
        if (privateLink && !parsed)
          throw new Error("A private letter needs its complete private link");
        if (parsed) {
          history.replaceState(
            null,
            "",
            `${location.pathname}${location.search}#/letter/${encodeURIComponent(parsed.id)}`,
          );
          setRoute(parsed);
        } else {
          const invitation = parsePostboxLink(hash);
          if (invitation) {
            setPostboxInvitation(invitation);
            return;
          }
          const publicLink = parsePublicLetterLink(hash);
          if (publicLink) {
            setPublicLetterRoute(publicLink);
            return;
          }
          const initialView = hash.slice(2) || "welcome";
          if (
            [
              "welcome",
              "privacy",
              "hall",
              "pot",
              "compose",
              "postboxes",
              "ledger",
              "network",
              "activity",
            ].includes(initialView)
          )
            setView(initialView);
        }
      } catch (e) {
        setError(
          privateLink
            ? scrubbed
              ? "This private link is incomplete or damaged. Ask its sender for the complete private link."
              : "This browser could not hide the private link. Close this tab and try a supported browser."
            : (e as Error).message,
        );
      }
    };
    if (!routeOnce.current) {
      routeOnce.current = true;
      readHash();
    }
    const readChangedHash = (event: HashChangeEvent) => {
      // popstate can already have consumed this navigation and scrubbed its
      // capability. Ignore that stale hashchange instead of parsing the short
      // address again. Keep popstate for Back/Forward, including equal hashes.
      if (event.newURL !== location.href) return;
      readHash();
    };
    window.addEventListener("hashchange", readChangedHash);
    window.addEventListener("popstate", readHash);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", readChangedHash);
      window.removeEventListener("popstate", readHash);
    };
  }, []);
  useEffect(() => {
    const sequence = ++readSequence.current;
    retryReader.current?.provider.stopWatcher();
    retryReader.current = undefined;
    if (!d.registry || !d.indexerUrl) {
      setReadState("idle");
      return;
    }
    setReadState("loading");
    let cancelled = false;
    let connected: PostOfficeClient | undefined;
    PostOfficeClient.connect(d)
      .then(async (c) => {
        connected = c;
        if (cancelled || sequence !== readSequence.current) {
          c.provider.stopWatcher();
          return;
        }
        const data = await c.read("", 100, { allowPartial: true });
        if (!cancelled && sequence === readSequence.current) {
          setChain(c);
          setReadState("ready");
          setLetters((previous) => preserveSealedViews(previous, data.letters));
          setUnavailableLetterIds(data.unavailableLetterIds);
          setBoxes(data.postboxes);
          setCursor(data.nextCursor);
          setStatus(
            data.unavailableLetterIds.length
              ? "Loaded available mail. Some letters need another read."
              : "Mail is up to date.",
          );
        } else c.provider.stopWatcher();
      })
      .catch(() => {
        connected?.provider.stopWatcher();
        if (!cancelled && sequence === readSequence.current) {
          setReadState("failed");
          setError(
            "Could not read the post office right now. Try Refresh in a moment.",
          );
        }
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
    if (
      !["activity", "postboxes"].includes(view) ||
      !chain ||
      busy ||
      writeBlocked
    ) {
      setAutoChecking(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const until = Date.now() + 120_000;
    async function check() {
      if (cancelled) return;
      const pending = inspectPending(browserStorage);
      const awaiting = pending.records.filter(
        (p) =>
          p.network === d.network &&
          p.registry === d.registry &&
          (view === "activity" || p.operation === "postbox") &&
          /^[a-f0-9]{64}$/.test(p.id) &&
          (p.state === "submitted" || p.state === "unknown"),
      );
      if (pending.error || !awaiting.length || Date.now() >= until) {
        setAutoChecking(false);
        return;
      }
      setAutoChecking(true);
      let delivered = false;
      if (!document.hidden)
        for (const p of awaiting) {
          try {
            const next = await readDelivery(chain!, p);
            if (cancelled) return;
            // Don't overwrite a concurrent manual reconciliation or wallet resume.
            const latest = readPending(browserStorage).find(
              (item) => item.id === p.id,
            );
            if (!latest || latest.state !== p.state || next.state === p.state)
              continue;
            savePending(browserStorage, next);
            setDeliveryRevision((revision) => revision + 1);
            if (next.state === "confirmed") {
              delivered = true;
              if (next.operation === "publish")
                finishPublication(next.envelopeId);
            }
          } catch {
            // Not yet indexed or temporarily offline. Keep the original attempt.
          }
        }
      if (delivered && !cancelled) {
        try {
          await refresh();
        } catch {
          /* The receipt remains confirmed. */
        }
      }
      if (!cancelled) timer = setTimeout(check, 6_000);
    }
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [view, chain, busy, prepared, writeBlocked, storageRevision]);
  useEffect(() => {
    if (!route || !chain) {
      setLinkState("idle");
      return;
    }
    const link = route,
      reader = chain;
    let cancelled = false;
    setLinkState("opening");
    setLinkError("");
    async function openPrivateLink() {
      try {
        if (!sameContext(link.context, d))
          throw new Error(
            "This private link belongs to another post office. Open the sender’s complete link after choosing its matching trusted settings.",
          );
        const e = await reader.readLetter(link.id);
        if (cancelled) return;
        if (!e || e.mode !== "link") throw new Error("Sealed letter not found");
        const result = await openLetter(
          e.payload as SealedPayload,
          link.capability,
          d,
          e.id,
          letterLimit(d),
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
            link,
          ),
        );
        setLinkState("idle");
      } catch {
        if (cancelled) return;
        setLinkState("failed");
        setLinkError(
          sameContext(link.context, d)
            ? "The post office may be unavailable, or this link may not match the letter. Retry here, or ask the sender for the complete private link."
            : "This private link belongs to another post office. Open the sender’s complete link after choosing its matching trusted settings.",
        );
      }
    }
    void openPrivateLink();
    return () => {
      cancelled = true;
    };
  }, [route, chain, linkRevision]);
  useEffect(() => {
    if (!publicLetterRoute || !chain || taskBusy || active) {
      setPublicLetterState("idle");
      return;
    }
    let cancelled = false;
    const link = publicLetterRoute,
      reader = chain;
    setPublicLetterState("opening");
    setPublicLetterError("");
    async function openPublicLink() {
      try {
        if (!sameContext(link.context, reader.deployment))
          throw new Error("Different post office");
        const envelope = await reader.readLetter(link.id);
        if (cancelled) return;
        if (envelope.mode !== "public")
          throw new Error("Only public letters can open through this route");
        setActive(envelope);
        setPlain(envelope.payload as Letter);
        setPublicLetterState("idle");
      } catch {
        if (cancelled) return;
        setPublicLetterState("failed");
        setPublicLetterError(
          sameContext(link.context, reader.deployment)
            ? "This public letter could not be read. Retry if the post office is unavailable, or check its complete link with the sender. Sealed letters require their private link or controlling postbox wallet."
            : "This public link belongs to a different post office or network. Check it with the sender; your settings have not been switched.",
        );
      }
    }
    void openPublicLink();
    return () => {
      cancelled = true;
    };
  }, [publicLetterRoute, chain, publicLetterRevision, taskBusy, active?.id]);
  useEffect(() => {
    if (!active) return;
    setClaimReview(undefined);
    if (current) {
      setDestMode("wallet");
      setAddress(current.address);
      setDestination(current.account.component_address);
    } else {
      setDestMode("manual");
      setAddress("");
      setDestination("");
    }
  }, [
    active?.id,
    active?.gift,
    active?.reserve,
    active?.claimed,
    wallet,
    account,
  ]);
  useEffect(() => {
    if (claimReview) {
      const heading = document.getElementById("collection-review-title");
      heading?.focus();
      heading?.scrollIntoView({ block: "nearest" });
    } else if (claimReviewWasOpen.current) {
      claimReviewTrigger.current?.focus();
    }
    claimReviewWasOpen.current = !!claimReview;
  }, [claimReview]);
  useEffect(() => {
    if (plain && active?.mode === "postbox" && !connect) {
      const title = document.getElementById("letter-title");
      title?.focus({ preventScroll: true });
      if (inlinePostboxReader) title?.scrollIntoView({ block: "nearest" });
    }
  }, [plain, active?.id, active?.mode, connect, inlinePostboxReader]);
  useEffect(
    () => () => {
      secret.current?.fill(0);
    },
    [],
  );
  useEffect(() => {
    if (!connect && (!active || inlinePostboxReader)) {
      modalReturnFocus.current = null;
      return;
    }
    if (!modalReturnFocus.current)
      modalReturnFocus.current = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>(".modal");
    if (!modal) return;
    const background = Array.from(
      document.querySelector<HTMLElement>(".app-shell")?.children || [],
    )
      .filter(
        (el): el is HTMLElement =>
          el instanceof HTMLElement && !el.classList.contains("modal-backdrop"),
      )
      .map((el) => ({ el, inert: el.inert }));
    background.forEach(({ el }) => {
      el.inert = true;
    });
    const overflow = document.body.style.overflow;
    const padding = document.body.style.paddingRight;
    const scrollbar = Math.max(
      0,
      window.innerWidth - document.documentElement.clientWidth,
    );
    document.body.style.overflow = "hidden";
    if (scrollbar)
      document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
    const controls = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],summary,[tabindex]",
        ),
      ).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
    (controls()[0] || modal).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (connect) {
          connectionSequence.current += 1;
          setConnect(false);
        } else if (!modalBusy.current) closeLetter();
      }
      if (event.key === "Tab") {
        const all = controls(),
          first = all[0],
          last = all.at(-1);
        if (!first) {
          event.preventDefault();
          modal.focus();
        } else if (!modal.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      background.forEach(({ el, inert }) => {
        el.inert = inert;
      });
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = padding;
      const previous = modalReturnFocus.current;
      if (
        previous?.isConnected &&
        !(previous instanceof HTMLButtonElement && previous.disabled)
      )
        previous.focus();
      else document.getElementById("main-content")?.focus();
    };
  }, [connect, active?.id, inlinePostboxReader]);
  useEffect(() => {
    if (!inlinePostboxReader || connect) return;
    const escape = (event: KeyboardEvent) => {
      // Keep keyboard focus with an approval in progress, while ordinary reading
      // leaves the folder sidebar and message list freely reachable.
      if (event.key === "Tab" && modalBusy.current && claimReview) {
        const reader = document.querySelector<HTMLElement>(".mailbox-letter");
        if (!reader) return;
        const controls = Array.from(
          reader.querySelectorAll<HTMLElement>(
            "button:not(:disabled),a[href],summary,[tabindex]",
          ),
        ).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (!first) {
          event.preventDefault();
          reader.focus();
        } else if (!reader.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if (event.key === "Escape" && !modalBusy.current) {
        event.preventDefault();
        const id = active?.id;
        closeLetter();
        requestAnimationFrame(() => {
          const row = Array.from(
            document.querySelectorAll<HTMLButtonElement>(
              ".mailbox-message-open",
            ),
          ).find((button) => button.dataset.envelopeId === id);
          row?.focus();
        });
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [inlinePostboxReader, connect, active?.id, !!claimReview]);
  function changeDeployment(
    change: Partial<Deployment>,
    reviewedProfile = false,
  ) {
    deploymentRevision.current += 1;
    initialOfficePending.current = false;
    setOfficeLoadError(false);
    draftSequence.current += 1;
    readSequence.current += 1;
    setLoadingMore(false);
    setPage(1);
    setPreview(false);
    setMailQuery("");
    setMailFilter("all");
    if (change.network !== undefined && change.network !== d.network)
      disconnect();
    setIndexerStatus("");
    setError("");
    setStatus("");
    closeLetter();
    setPrepared(undefined);
    setReview(false);
    setLinkSaved(false);
    setReply("");
    setChain(undefined);
    setReadState("idle");
    setLetters([]);
    setMailboxPlain(new Map());
    setSentPlain(new Map());
    setThread(undefined);
    setMailboxPreferences(new Map());
    setUnavailableLetterIds([]);
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
      contractProtocol:
        reviewedProfile ||
        (change.network !== undefined && change.network !== d.network)
          ? change.contractProtocol
          : (change.contractProtocol ?? d.contractProtocol),
      sealedDelivery:
        reviewedProfile ||
        (change.network !== undefined && change.network !== d.network)
          ? change.sealedDelivery
          : (change.sealedDelivery ?? d.sealedDelivery),
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
  async function restoreOffice(retryInitial = false) {
    const revision = ++deploymentRevision.current;
    setOfficeLoadError(false);
    try {
      const profile = await loadOfficeProfile(
        `${import.meta.env.BASE_URL}deployment.json`,
      );
      if (revision !== deploymentRevision.current) return;
      if (retryInitial && initialOfficePending.current) {
        // Completing the first load must preserve incoming links kept in memory.
        initialOfficePending.current = false;
        setD(profile);
      } else changeDeployment(profile, true);
      setStatus("Sapient post office settings restored.");
    } catch {
      if (revision === deploymentRevision.current) setOfficeLoadError(true);
    }
  }
  function navigate(v: string, publicationSubmitted = false) {
    setFeeProblem(undefined);
    if (v === "compose" && busy) return;
    if (v === "compose") {
      composerReturnFocus.current = document.activeElement as HTMLElement;
      setComposerMinimized(false);
      focusAddressedDraft.current = true;
    }
    if (
      v !== "compose" &&
      !(v === "postboxes" && view === "compose") &&
      active?.mode === "postbox" &&
      inlinePostboxReader
    ) {
      if (busy && !publicationSubmitted) return;
      closeLetter();
    }
    setPublicLetterRoute(undefined);
    setPublicLetterState("idle");
    setPostboxInvitation(undefined);
    setView(v);
    if (v !== "hall") {
      setPreview(false);
      setMailFilter("all");
    }
    setError("");
    setPublicConfirmed(false);
    setReview(false);
    history.pushState(null, "", `${location.pathname}#/${v}`);
    window.scrollTo(0, 0);
  }
  function closeComposer() {
    if (busy) return;
    navigate("postboxes");
    requestAnimationFrame(() => {
      const previous = composerReturnFocus.current;
      if (previous?.isConnected && previous.getClientRects().length)
        previous.focus({ preventScroll: true });
      else
        document
          .querySelector<HTMLButtonElement>('nav button[title="My inbox"]')
          ?.focus();
    });
  }
  function beginAddressedDraft(
    id: string,
    replyTitle?: string,
    original?: Envelope,
    originalPlain?: Letter,
  ) {
    if (busy) return;
    setRequestPayment(false);
    const postbox = boxes.find((p) => p.id === id);
    if (!postbox) return;
    const keptDraft = !!(subject || body || (gift && gift !== "0"));
    focusAddressedDraft.current = true;
    draftSequence.current += 1;
    if (!inlinePostboxReader) closeLetter();
    setMode("postbox");
    setRecipient(id);
    setThread(original ? replyThread(original, originalPlain) : undefined);
    if (original?.recipientPostbox) {
      const home = boxes.find(
        (p) =>
          p.id === original.recipientPostbox &&
          wallet?.accounts.some(
            (a) => a.account.owner_public_key === p.controller,
          ),
      );
      if (home) {
        setReply(home.id);
        setAccount(
          wallet!.accounts.findIndex(
            (a) => a.account.owner_public_key === home.controller,
          ),
        );
      }
    }
    if (replyTitle && !subject.trim())
      setSubject(
        (/^re:/i.test(replyTitle) ? replyTitle : `Re: ${replyTitle}`).slice(
          0,
          120,
        ),
      );
    setPrepared(undefined);
    setLinkSaved(false);
    navigate("compose");
    setStatus(
      `Writing to ${postbox.nickname}. ${keptDraft ? "Your existing draft is kept. " : ""}Review the recipient and gift before publishing.`,
    );
  }
  function finishPublication(id: string) {
    if (prepared?.envelope.id !== id) return;
    if (prepared.capability)
      setPrivateLink(
        createGiftLink(new URL(import.meta.env.BASE_URL, location.href).href, {
          id,
          capability: prepared.capability,
          context: d,
        }),
      );
    // A delayed receipt must never erase a newer letter in the composer.
    if (prepared.draftSnapshot !== currentDraftSnapshot.current) return;
    draftSequence.current += 1;
    setSubject("");
    setBody("");
    setRecipient("");
    setThread(undefined);
    setGift("0");
    setReserve("0");
    setRequestPayment(false);
    setRequestedAmount("0");
    setPublicConfirmed(false);
    setMode("postbox");
    setReview(false);
    setPrepared(undefined);
    setLinkSaved(false);
  }
  function closeLetter() {
    setPaymentReview(undefined);
    setPaymentNotice("");
    collectionFocus.clear();
    inboxFocus.clear();
    setPublicLetterRoute(undefined);
    setPublicLetterState("idle");
    setPublicLetterError("");
    openSequence.current += 1;
    secret.current?.fill(0);
    secret.current = undefined;
    setActive(undefined);
    setClaimReview(undefined);
    setPlain(undefined);
    setGhost(false);
    setPrivateLink("");
    setRoute(undefined);
    setLinkState("idle");
    setLinkError("");
  }
  async function refresh() {
    if (!d.registry || !d.indexerUrl) return;
    const sequence = ++readSequence.current;
    setLoadingMore(false);
    const letterSequence = openSequence.current;
    setReadState("loading");
    let reader: PostOfficeClient | undefined;
    let data;
    try {
      reader = chain || (await PostOfficeClient.connect(d));
      data = await reader.read("", 100, { allowPartial: true });
      // Refresh every page the visitor already loaded, including failed references.
      const loadedPages = Math.max(
        1,
        Math.ceil((letters.length + unavailableLetterIds.length) / 100),
      );
      for (let page = 1; page < loadedPages && data.nextCursor; page++) {
        if (sequence !== readSequence.current) break;
        const next = await reader.read(data.nextCursor, 100, {
          allowPartial: true,
        });
        data = {
          ...next,
          letters: [...data.letters, ...next.letters],
          unavailableLetterIds: [
            ...data.unavailableLetterIds,
            ...next.unavailableLetterIds,
          ],
        };
      }
    } catch {
      if (!chain) reader?.provider.stopWatcher();
      if (sequence !== readSequence.current) return;
      setReadState("failed");
      setStatus("");
      throw new Error(
        chain
          ? "Could not refresh the post office. Your loaded mail is still here; try Refresh again."
          : "Could not read the post office right now. Try Refresh in a moment.",
      );
    }
    if (sequence !== readSequence.current) {
      if (!chain) reader.provider.stopWatcher();
      return;
    }
    setChain(reader);
    setReadState("ready");
    if (!chain) retryReader.current = reader;
    setLetters((previous) => preserveSealedViews(previous, data.letters));
    setUnavailableLetterIds(data.unavailableLetterIds);
    setBoxes(data.postboxes);
    setCursor(data.nextCursor);
    setPage(1);
    setStatus(
      data.unavailableLetterIds.length
        ? "Loaded available mail. Some letters need another read."
        : "Mail is up to date.",
    );
    if (active && !activeSample) {
      const updated = await reader.readLetter(active.id, active.component);
      if (
        sequence === readSequence.current &&
        letterSequence === openSequence.current
      )
        setActive(updated);
    }
  }
  async function loadMore() {
    if (!chain || !cursor || loadingMore) return;
    const sequence = readSequence.current;
    const reader = chain;
    setLoadingMore(true);
    setError("");
    try {
      const data = await reader.read(cursor, 100, { allowPartial: true });
      if (sequence !== readSequence.current) return;
      setLetters((old) => [
        ...old,
        ...data.letters.filter((e) => !old.some((x) => x.id === e.id)),
      ]);
      setUnavailableLetterIds((old) => [
        ...new Set([...old, ...data.unavailableLetterIds]),
      ]);
      setBoxes(data.postboxes);
      setCursor(data.nextCursor);
    } catch {
      if (sequence === readSequence.current)
        setError(
          "More letters could not load. Your loaded mail is still here; try Load more again.",
        );
    } finally {
      if (sequence === readSequence.current) setLoadingMore(false);
    }
  }
  function lockSealedMail() {
    setPrivateAccessRevision((revision) => revision + 1);
    for (const session of sealedSessions.current.values()) session.dispose();
    sealedSessions.current.clear();
    sealedOpening.current.clear();
    setComposeViewApproved(false);
    setPrepared(undefined);
    setReview(false);
    setSealedProgress(new Map());
    setMailboxPlain(new Map());
    setSentPlain(new Map());
    closeLetter();
    setLetters((old) =>
      old.map((e) =>
        e.deliveryProtocol === "mm-sealed-2"
          ? {
              ...e,
              localAccess: undefined,
              recipientPostbox: undefined,
              replyPostbox: undefined,
              claimAuthority: undefined,
            }
          : e,
      ),
    );
  }
  async function sealedSession(postbox: string) {
    if (
      !chain ||
      d.contractProtocol !== "unified-2" ||
      !(wallet instanceof SapientSession)
    )
      throw new Error("Connect Sapient to the sealed post office");
    const existing = sealedSessions.current.get(postbox);
    if (existing && !existing.isDisposed) return existing;
    const pending = sealedOpening.current.get(postbox);
    if (pending) return pending;
    const generation = connectionSequence.current,
      revision = deploymentRevision.current;
    const opening = SealedMailboxSession.open(
      chain.sealedOffice(),
      wallet,
      postbox,
    );
    sealedOpening.current.set(postbox, opening);
    let session: SealedMailboxSession;
    try {
      session = await opening;
    } finally {
      if (sealedOpening.current.get(postbox) === opening)
        sealedOpening.current.delete(postbox);
    }
    if (
      generation !== connectionSequence.current ||
      revision !== deploymentRevision.current
    ) {
      session.dispose();
      throw new Error("Wallet or post office changed during recovery");
    }
    sealedSessions.current.set(postbox, session);
    return session;
  }
  async function paymentClientForLetter() {
    if (
      !active ||
      active.deliveryProtocol !== "mm-sealed-2" ||
      !privatePaymentsEnabled ||
      !chain ||
      !(wallet instanceof SapientSession)
    )
      throw new Error(
        "Connect Sapient and open an enabled sealed payment letter",
      );
    const box = boxes.find(
      (p) =>
        p.id === active.recipientPostbox &&
        p.controller === wallet.accounts[0].account.owner_public_key,
    );
    if (!box)
      throw new Error(
        "Select the Sapient wallet receiving this private letter",
      );
    const session = await sealedSession(box.id),
      generation = connectionSequence.current,
      revision = deploymentRevision.current;
    const client = privatePaymentClient(
      d,
      chain,
      session,
      wallet,
      box,
      browserStorage,
      (message) => {
        if (
          generation === connectionSequence.current &&
          revision === deploymentRevision.current
        ) {
          setPaymentNotice(message);
          setStatus(message);
        }
      },
    );
    return { client, box, generation, revision };
  }
  async function payActiveRequest() {
    const id = active?.id;
    if (!id || paymentReview !== id)
      throw new Error("Review this private payment before approving");
    const { client, box, generation, revision } =
      await paymentClientForLetter();
    await client.pay(id, paymentFee);
    if (
      generation !== connectionSequence.current ||
      revision !== deploymentRevision.current
    )
      throw new Error(
        "Payment session changed; resume its original recovery record",
      );
    setPaymentReview(undefined);
    setPaymentNotice(
      "Private payment and encrypted receipt confirmed. Checking again resumes this same payment; it does not pay twice.",
    );
    await refresh();
    await discoverSealed(box, true);
  }
  async function importActivePayment() {
    const id = active?.id;
    if (!id) throw new Error("Open the private payment receipt");
    const { client, generation, revision } = await paymentClientForLetter(),
      result = await client.import(id);
    if (
      generation !== connectionSequence.current ||
      revision !== deploymentRevision.current
    )
      throw new Error("Payment session changed");
    setPaymentNotice(
      `Verified ${tari(result.amount)} test TARI ${result.alreadyImported ? "already available in your private Sapient balance" : "and imported it into Sapient"}. No transaction or spending approval was needed.${result.transactionHistoryAvailable ? "" : " The indexer no longer retains the transaction receipt; the current unspent output, ownership, amount and memo were verified instead."}`,
    );
  }
  async function discoverSealed(box: Postbox, refresh = false) {
    const generation = connectionSequence.current,
      revision = deploymentRevision.current;
    const session = await sealedSession(box.id);
    try {
      if (refresh) session.restartDiscovery();
      const progress = await session.loadMore(),
        messages = await session.messages(),
        entries = new Map(
          (await session.recoveredEntries()).map((e) => [e.id, e]),
        );
      if (
        generation !== connectionSequence.current ||
        revision !== deploymentRevision.current
      ) {
        session.dispose();
        return;
      }
      const recovered = messages.map((m) =>
        recoveredSealedEnvelope(entries.get(m.id)!, m, boxes, d),
      );
      setLetters((previous) => {
        const next = new Map(previous.map((e) => [e.id, e]));
        for (const e of recovered) {
          const prior = next.get(e.id);
          next.set(e.id, {
            ...e,
            component: e.component ?? prior?.component,
            localAccess: {
              inbox: e.localAccess!.inbox || !!prior?.localAccess?.inbox,
              sent: e.localAccess!.sent || !!prior?.localAccess?.sent,
            },
          });
        }
        return [...next.values()];
      });
      setMailboxPlain((previous) => {
        const next = new Map(previous);
        for (const m of messages) if (m.inbox) next.set(m.id, m.message.letter);
        return next;
      });
      setSentPlain((previous) => {
        const next = new Map(previous);
        for (const m of messages) if (m.sent) next.set(m.id, m.message.letter);
        return next;
      });
      setSealedProgress((previous) => new Map(previous).set(box.id, progress));
      setStatus(
        `${messages.length} private letters recovered from ${progress.loaded} sealed deliveries.${progress.complete ? " All current pages checked." : " Load the next page to find more mail."} Reading sent no transaction.`,
      );
    } catch (error) {
      if (session.isDisposed) lockSealedMail();
      throw error;
    }
  }
  async function readSealed(
    envelope: Envelope,
    sent: boolean,
  ): Promise<Letter> {
    const id = sent ? envelope.replyPostbox : envelope.recipientPostbox;
    if (!id)
      throw new Error("Unlock the receiving postbox to discover this letter");
    const session = await sealedSession(id);
    try {
      const opened = (await session.messages()).find(
        (m) => m.id === envelope.id && (sent ? m.sent : m.inbox),
      );
      if (!opened)
        throw new Error(
          "Discover this postbox's private mail before opening the letter",
        );
      return opened.message.letter;
    } catch (error) {
      if (session.isDisposed) lockSealedMail();
      throw error;
    }
  }
  useEffect(() => {
    if (
      !(wallet instanceof SapientSession) ||
      d.contractProtocol !== "unified-2"
    )
      return;
    let active = true;
    const check = () => {
      if (document.hidden || !sealedSessions.current.size) return;
      void wallet
        .hasPostboxViewAccess()
        .then((granted) => {
          if (active && !granted) lockSealedMail();
        })
        .catch(() => {
          if (active) lockSealedMail();
        });
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [wallet, d.network, d.registry, d.template]);
  async function readPostbox(envelope: Envelope): Promise<Letter> {
    if (envelope.deliveryProtocol === "mm-sealed-2")
      return readSealed(envelope, false);
    const session = connectionSequence.current;
    const deployment = deploymentRevision.current;
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
    if (
      session !== connectionSequence.current ||
      deployment !== deploymentRevision.current
    )
      throw new Error(
        "Wallet session changed. Reconnect before unlocking your mail.",
      );
    setMailboxPlain((previous) => new Map(previous).set(envelope.id, letter));
    return letter;
  }
  async function readSent(envelope: Envelope): Promise<Letter> {
    if (envelope.deliveryProtocol === "mm-sealed-2")
      return readSealed(envelope, true);
    const session = connectionSequence.current,
      deployment = deploymentRevision.current;
    const copy = sentCopy(envelope);
    const owner = wallet?.accounts.find(
      (a) => a.account.owner_public_key === envelope.sender,
    );
    if (
      !copy ||
      !(wallet instanceof SapientSession) ||
      !owner ||
      !chain ||
      envelope.context.network !== chain.deployment.network ||
      envelope.context.registry !== chain.deployment.registry ||
      envelope.context.template !== chain.deployment.template
    )
      throw new Error("Connect the sending postbox's Sapient wallet");
    const letter = await wallet
      .capsuleMailbox((id) => chain.provider.getSubstate(id))
      .open(
        owner.account.component_address,
        sentContext(envelope, copy),
        await sentPurpose(envelope),
        copy.payload,
      );
    if (
      session !== connectionSequence.current ||
      deployment !== deploymentRevision.current
    )
      throw new Error(
        "Wallet session changed. Reconnect before unlocking sent mail.",
      );
    setSentPlain((previous) => new Map(previous).set(envelope.id, letter));
    return letter;
  }
  async function openPostbox(envelope: Envelope) {
    closeLetter();
    setActive(envelope);
    const sequence = openSequence.current;
    const cached = mailboxPlain.get(envelope.id);
    if (cached && envelope.deliveryProtocol !== "mm-sealed-2") {
      setPlain(cached);
      return;
    }
    const letter = await readPostbox(envelope);
    if (openSequence.current === sequence) setPlain(letter);
  }
  function composeFromPostbox(box: Postbox) {
    if (busy) return;
    setRequestPayment(false);
    const owner = wallet?.accounts.findIndex(
      (a) => a.account.owner_public_key === box.controller,
    );
    if (owner === undefined || owner < 0) return;
    draftSequence.current += 1;
    if (!inlinePostboxReader) closeLetter();
    setAccount(owner);
    setMode("postbox");
    setReply(box.id);
    setThread(undefined);
    setPrepared(undefined);
    setLinkSaved(false);
    focusAddressedDraft.current = true;
    navigate("compose");
    setStatus("");
  }
  const hallLetters = preview
    ? sampleMail
    : letters.filter((e) => e.mode === "public");
  const shown = preview
    ? filterSampleMail(mailFilter, mailQuery)
    : filterHallMail(hallLetters, mailFilter, mailQuery);
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(shown.length / 12)));
  const current = wallet?.accounts[account];
  const draftPostbox =
    mode === "postbox" ? boxes.find((p) => p.id === recipient) : undefined;
  const sendingBox = boxes.find(
    (p) => p.id === reply && p.controller === current?.account.owner_public_key,
  );
  useEffect(() => {
    if (sealedCompose && !sendingBox && owned.length) setReply(owned[0].id);
  }, [sealedCompose, sendingBox?.id, owned.map((p) => p.id).join(",")]);
  const contactHome =
    sendingBox ||
    boxes.find((p) => p.controller === current?.account.owner_public_key);
  const contactGroups = recipientGroups(
    boxes,
    letters,
    contactHome,
    contactHome ? mailboxPreferences.get(contactHome.id)?.favourites : [],
  );
  let sentDescriptor;
  try {
    const key = sendingBox && mailboxKey(sendingBox.encryptionKey);
    if (unifiedOffice(d) && key?.recovery === "sapient-capsule-1")
      sentDescriptor = key;
  } catch {
    /* A damaged descriptor cannot enable a sent copy. */
  }
  const includeSent =
    mode !== "public" && saveSent && !!sentDescriptor && !!sendingBox;
  const draftLetter: Letter = {
    subject,
    body,
    ...(mode === "postbox" && thread ? { thread } : {}),
    ...(sealedCompose &&
    privatePaymentsEnabled &&
    requestPayment &&
    current?.address
      ? {
          privatePayment: {
            version: "mm-payment-1" as const,
            kind: "request" as const,
            nonce: requestNonce,
            resource: privateTari,
            amount: requestedAmount,
            destination: current.address,
          },
        }
      : {}),
  };
  const draftMetadata = {
    mode,
    context: d,
    gift,
    reserve,
    claimed: false,
    sender: current?.account.owner_public_key || "",
    replyPostbox: reply,
    recipientPostbox: draftPostbox?.id,
    claimAuthority: draftPostbox?.controller,
  };
  const draftSnapshot = JSON.stringify([
    draftSequence.current,
    draftLetter,
    draftMetadata,
    saveSent,
    requestPayment,
    requestedAmount,
  ]);
  currentDraftSnapshot.current = draftSnapshot;
  let draftSize: number | undefined;
  try {
    if (sealedCompose && sendingBox && draftPostbox) {
      const senderKey = mailboxKey(sendingBox.encryptionKey),
        recipientKey = mailboxKey(draftPostbox.encryptionKey);
      draftSize =
        new TextEncoder().encode(
          JSON.stringify({
            version: "mm-message-1",
            recipient: {
              postbox: draftPostbox.id,
              keyVersion: recipientKey.keyVersion,
              publicKey: recipientKey.publicKey,
              ...(thread ? { conversation: "0".repeat(64) } : {}),
            },
            sender: {
              postbox: sendingBox.id,
              keyVersion: senderKey.keyVersion,
              publicKey: senderKey.publicKey,
              controller: sendingBox.controller,
            },
            letter: draftLetter,
            ...(privateReplies
              ? {
                  reply: {
                    conversation: "0".repeat(64),
                    publicKey: "0".repeat(64),
                  },
                }
              : {}),
          }),
        ).length + 4;
    } else if (mode !== "postbox" || draftPostbox)
      draftSize = draftEnvelopeSize(
        draftLetter,
        { ...draftMetadata, id: "0".repeat(36) },
        draftPostbox ? mailboxKey(draftPostbox.encryptionKey) : undefined,
        includeSent
          ? {
              key: sentDescriptor!,
              postbox: sendingBox!.id,
              controller: sendingBox!.controller,
            }
          : undefined,
      );
  } catch {
    /* Invalid postbox keys stay blocked by the existing preparation checks. */
  }
  const composeLimit = sealedCompose ? 16384 : letterLimit(d);
  const draftTooLarge = draftSize !== undefined && draftSize > composeLimit;

  function clearWallet(revoke: boolean) {
    restoreBlocked.current = true;
    try {
      sessionStorage.removeItem("ghostdrop:sapient-resume:v1");
    } catch {
      /* Optional reload convenience. */
    }
    connectionSequence.current += 1;
    draftSequence.current += 1;
    openSequence.current += 1;
    if (revoke) wallet?.disconnect();
    setWallet(undefined);
    setMailboxPlain(new Map());
    setSentPlain(new Map());
    setThread(undefined);
    setMailboxPreferences(new Map());
    setClaimReview(undefined);
    secret.current?.fill(0);
    secret.current = undefined;
    setPlain(undefined);
    setActive(undefined);
    setPrivateLink("");
    setRoute(undefined);
    setPrepared(undefined);
    setReview(false);
    setLinkSaved(false);
    setReply("");
    setStatus(
      "Disconnected from Sapient. Private session state was cleared; manage site permissions in your wallet.",
    );
  }
  function disconnect() {
    clearWallet(true);
  }
  async function prepare() {
    const sequence = draftSequence.current;
    if (draftTooLarge)
      throw new Error(
        "This letter is full. Shorten the subject or message before reviewing.",
      );
    const giftAmount = money(gift),
      collection = money(reserve);
    if (money(fee) <= 0n) throw new Error("Set a positive sending fee limit.");
    if (giftAmount > 0n && collection === 0n)
      throw new Error(
        "Set aside collection funds so the recipient can receive the full gift.",
      );
    if (giftAmount === 0n && collection > 0n)
      throw new Error("A letter without a gift needs no collection funds.");
    if (giftAmount + collection > 18_446_744_073_709_551_615n)
      throw new Error("Gift and collection funds together are too large.");
    if (!subject.trim() || !body.trim())
      throw new Error("Write a subject and a message");
    const postbox = draftPostbox;
    if (mode === "postbox" && !postbox)
      throw new Error("Choose a registered recipient postbox");
    if (sealedCompose) {
      if (
        !sendingBox ||
        !(wallet instanceof SapientSession) ||
        !composeViewApproved
      )
        throw new Error(
          "Choose your sending postbox and unlock private mail access before reviewing",
        );
      if (giftAmount !== 0n || collection !== 0n)
        throw new Error(
          "Sealed mail does not yet support attached private payments; no public funding fallback is allowed",
        );
      const session = await sealedSession(sendingBox.id);
      const sealedReview = await session.prepare(draftLetter, postbox!.id, {
        replyTo: thread?.parent,
        privateReply: privateReplies,
      });
      if (draftSequence.current !== sequence) return;
      const envelope: Envelope = {
        deliveryProtocol: "mm-sealed-2",
        localAccess: { inbox: false, sent: true },
        id: sealedReview.id,
        mode: "postbox",
        context: {
          network: d.network,
          registry: d.registry,
          template: d.template,
        },
        payload: sealedReview.payload,
        sender: sendingBox.controller,
        replyPostbox: sendingBox.id,
        recipientPostbox: postbox!.id,
        claimAuthority: postbox!.controller,
        gift: "0",
        reserve: "0",
        claimed: false,
      };
      setPrepared({ envelope, sealedReview, draftSnapshot });
      setReview(true);
      return;
    }
    const id = crypto.randomUUID();
    const sealed =
      mode === "link"
        ? await sealLetter(draftLetter, d, id, letterLimit(d))
        : undefined;
    const key = postbox ? mailboxKey(postbox.encryptionKey) : undefined;
    const addressed =
      postbox && key
        ? await sealMailbox(
            draftLetter,
            {
              ...d,
              postbox: postbox.id,
              controller: postbox.controller,
              keyVersion: key.keyVersion,
            },
            id,
            key,
            letterLimit(d),
          )
        : undefined;
    let envelope: Envelope = {
      ...draftMetadata,
      id,
      payload: addressed || sealed?.payload || draftLetter,
    };
    if (includeSent)
      envelope = await addSentCopy(envelope, draftLetter, sendingBox!);
    assertEnvelopeSize(envelope, letterLimit(d));
    if (draftSequence.current !== sequence) return;
    setLinkSaved(false);
    setPrepared({ envelope, capability: sealed?.capability, draftSnapshot });
    setReview(true);
  }
  function turnMailPage(next: number) {
    setPage(next);
    requestAnimationFrame(() => hallRange.current?.focus());
  }
  function togglePreview() {
    closeLetter();
    setPreview(!preview);
    setPage(1);
    setMailQuery("");
    setMailFilter("all");
  }
  async function checkActivity(p: Pending) {
    await task(async () => {
      if (!chain) return;
      if (p.id.startsWith("attempt:")) {
        if (["postbox", "capsule", "mailbox", "pot"].includes(p.operation)) {
          setStatus(
            "This wallet submission has no transaction ID. Inspect the controlling wallet's transaction history before resolving it; matching on-chain state alone cannot identify the submitted transaction. Retrying remains blocked.",
          );
          return;
        }
        const e = await chain.readLetter(p.envelopeId);
        if (p.operation === "publish") {
          await verifySealedPublication(p, e);
          savePending(browserStorage, {
            ...p,
            state: "confirmed",
          });
          await refresh();
          if (p.operation === "publish") finishPublication(p.envelopeId);
          setStatus(
            "Envelope state confirms delivery/publication. For missing or ambiguous attempts inspect donor/account history before retrying.",
          );
        } else {
          // A public/private-link gift may have been collected by someone else.
          // Without this attempt's receipt, its claimed flag cannot identify our payout.
          setStatus(
            e.claimed
              ? "This gift has been collected, but its state cannot confirm your payout. Inspect your receiving account and its transaction history. The original attempt remains unresolved; do not send a replacement."
              : "This collection has no transaction ID. Inspect your receiving account and its transaction history. The original attempt remains unresolved; do not send a replacement.",
          );
        }
        return;
      }
      const next = await readDelivery(chain, p);
      const state = next.state;
      savePending(browserStorage, next);
      await refresh();
      setStatus(`Transaction ${short(p.id)}: ${state}.`);
      if (state === "confirmed" && p.operation === "publish")
        finishPublication(p.envelopeId);
    });
  }
  async function resumeActivity(p: Pending) {
    await task(async () => {
      if (!(wallet instanceof SapientSession)) return;
      const id = await wallet.resume(p.id, browserStorage);
      setStatus(`Sapient submission ${id}. Reconcile chain confirmation next.`);
    });
  }
  const invitationPanel = postboxInvitation && (
    <PostboxInvitation
      invitation={postboxInvitation}
      deployment={d}
      boxes={boxes}
      ready={readState === "ready"}
      failed={readState === "failed"}
      busy={busy || connect || !!active}
      onAccept={(id) => beginAddressedDraft(id)}
      onDismiss={() => navigate(view)}
      onRetry={() => void task(refresh)}
    />
  );
  const storageNotices = (
    <>
      {storageError && (
        <div role="alert" className="message error">
          <strong>Browser storage needs permission.</strong>
          <p>{storageError}</p>
          <button
            onClick={() => {
              setStorageError(checkBrowserStorage());
              setDeliveryRevision((value) => value + 1);
            }}
          >
            Recheck browser storage
          </button>
        </div>
      )}
      {deliveryHistory.error && !storageError && (
        <div role="alert" className="message error">
          <strong>Your delivery history needs attention.</strong>
          <p>
            Sending and collection are paused because this browser’s saved
            records cannot be read. Check Sapient transaction history before
            recovering local storage. Don’t send a replacement or clear the
            records while an outcome is uncertain.
          </p>
        </div>
      )}
    </>
  );
  const publicTitles = Object.fromEntries(
    letters
      .filter((e) => e.mode === "public")
      .map((e) => [e.id, (e.payload as Letter).subject]),
  );
  const sampleTitles = Object.fromEntries(
    sampleMail
      .filter((e) => e.mode === "public")
      .map((e) => [e.id, sampleLetter(e.id)!.subject]),
  );
  return (
    <div
      className={`app-shell view-${mailboxView ? "postboxes" : view} ${mailboxView ? "inbox-layout" : ""}`}
    >
      <div className="haunting" aria-hidden="true">
        <div className="haunting-mist" />
        <span className="haunting-mote" />
        <span className="haunting-mote" />
        <span className="haunting-mote" />
      </div>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="topbar">
        <a
          className="brand"
          href="#/welcome"
          onClick={(e) => {
            e.preventDefault();
            navigate("welcome");
          }}
        >
          <span className="brand-icon" aria-hidden="true">
            <GhostMark />
          </span>
          <span>
            MoonMail<small>YOUR WORDS, UNDER COVER OF NIGHT</small>
          </span>
        </a>
        {mailboxView && owned.length > 0 && (
          <div className="header-search-target" ref={setMailboxSearchTarget} />
        )}
        <nav aria-label="Main navigation">
          {[
            ["postboxes", "My inbox"],
            ["hall", "Public mail"],
            ["pot", "Moon Pot"],
            ["activity", "Activity"],
          ].map(([v, label]) => (
            <button
              key={v}
              disabled={busy}
              title={label}
              className={
                view === v || (v === "postboxes" && mailboxView)
                  ? "nav-active"
                  : ""
              }
              aria-current={
                view === v || (v === "postboxes" && mailboxView)
                  ? "page"
                  : undefined
              }
              onClick={() => navigate(v)}
            >
              <UiIcon
                name={
                  v === "postboxes"
                    ? "inbox"
                    : v === "hall"
                      ? "globe"
                      : v === "pot"
                        ? "gift"
                        : "activity"
                }
              />
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="wallet-actions">
          {status === "Mail is up to date." && view !== "compose" && (
            <div role="status" className="mail-sync-status">
              <UiIcon name="check" /> {status}
            </div>
          )}
          <div className="wallet-controls">
            {wallet && current && (
              <button
                className="wallet-details-button"
                disabled={busy}
                onClick={() => setConnect(true)}
              >
                Wallet details
              </button>
            )}
            <button
              className="wallet-button"
              disabled={busy}
              onClick={() => (wallet ? disconnect() : setConnect(true))}
            >
              <span className={wallet ? "dot live" : "dot"} />
              {wallet ? "Disconnect wallet" : "Connect wallet"}
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {!["welcome", "privacy", "compose", "hall"].includes(view) &&
          (!mailboxView || !owned.length) && (
            <div className="privacy-shortcut">
              <button
                className="text-button"
                onClick={() => navigate("privacy")}
              >
                What can others see?
              </button>
            </div>
          )}
        {!!pendingMailboxChanges.length &&
          view !== "postboxes" &&
          view !== "compose" && (
            <div className="mailbox-save-bar" role="status">
              <strong>
                {pendingMailboxChanges.length} postbox
                {pendingMailboxChanges.length === 1 ? " has" : "es have"}{" "}
                unsaved mailbox changes
              </strong>
              <p>
                Your read status, archive and favourites stay in this session
                until saved to Ootle.
              </p>
              <button disabled={busy} onClick={() => navigate("postboxes")}>
                Return to my inbox to save
              </button>
            </div>
          )}

        {officeLoadError && (
          <div role="alert" className="message error">
            <p>
              Post office settings could not load. Your current settings are
              kept. Try loading them again.
            </p>
            <button
              disabled={busy}
              onClick={() => void task(() => restoreOffice(true))}
            >
              Retry loading post office
            </button>
          </div>
        )}
        {view !== "compose" && invitationPanel}
        {publicLetterRoute && !active && (
          <section
            className="deployment-note private-link-status"
            aria-label="Public letter status"
            role="status"
          >
            <div>
              <strong>
                {publicLetterState === "opening"
                  ? "Opening the public letter…"
                  : publicLetterState === "failed"
                    ? "This public letter could not open."
                    : "Your public letter is waiting."}
              </strong>
              <p>
                {publicLetterError ||
                  (readState === "failed"
                    ? "The post office could not be reached. Refresh to try this letter again."
                    : "Reading the selected post office. Opening a public letter needs no wallet and never collects its gift.")}
              </p>
            </div>
            <div className="actions">
              {(publicLetterState === "failed" || readState === "failed") && (
                <button
                  disabled={taskBusy}
                  onClick={() =>
                    chain
                      ? setPublicLetterRevision((v) => v + 1)
                      : void task(refresh)
                  }
                >
                  Retry public letter
                </button>
              )}
              <button
                disabled={taskBusy}
                onClick={() => {
                  closeLetter();
                  navigate("hall");
                }}
              >
                Dismiss public letter
              </button>
            </div>
          </section>
        )}
        {route && !active && (
          <section
            className="deployment-note private-link-status"
            aria-label="Private letter status"
            role="status"
          >
            <div>
              <strong>
                {linkState === "opening"
                  ? "Opening your private letter…"
                  : linkState === "failed"
                    ? "Your private letter could not open."
                    : "Your private letter is waiting."}
              </strong>
              <p>
                {linkError ||
                  "The secret stays in this tab. Keep the sender’s complete link to reopen this letter later."}
              </p>
            </div>
            <div className="actions">
              <button
                disabled={busy || readState === "loading"}
                onClick={() => {
                  if (!chain) void task(refresh);
                  else setLinkRevision((value) => value + 1);
                }}
              >
                Retry private letter
              </button>
              <button
                disabled={taskBusy}
                onClick={() => {
                  closeLetter();
                  navigate("hall");
                }}
              >
                Dismiss private letter
              </button>
            </div>
          </section>
        )}
        {view === "welcome" && (
          <Landing
            onOpen={() => navigate("postboxes")}
            onPublic={() => navigate("hall")}
            onPrivacy={() => navigate("privacy")}
          />
        )}
        {view === "privacy" && (
          <PrivacyView
            sealed={d.contractProtocol === "unified-2"}
            payments={privatePaymentsEnabled}
          />
        )}
        {view === "pot" && (
          <MoonPot
            deployment={d}
            wallet={wallet instanceof SapientSession ? wallet : undefined}
            postboxes={boxes}
            fee={fee}
            busy={busy}
            task={task}
            onConnect={() => setConnect(true)}
            onActivity={() => navigate("activity")}
            feeProblem={
              feeProblem?.operation === "pot" ? feeProblem : undefined
            }
            onFeeChange={setFee}
          />
        )}
        {view === "hall" && (
          <>
            <section className="hero public-mail-header">
              <div className="public-mail-intro">
                <p className="kicker">MOONMAIL · THE PUBLIC HALL</p>
                <h1>
                  Letters for <em>anyone.</em>
                </h1>
                <p>
                  A thought for a stranger. A story for the night. A little
                  kindness, left where someone might find it.
                </p>
                <div className="hero-rule">
                  <UiIcon name="globe" /> Read without a wallet · Opening a
                  letter never claims a gift
                </div>
              </div>
              <div className="public-mail-welcome" aria-hidden="true">
                <GhostMark />
              </div>
              <div className="hero-actions">
                <button className="primary" onClick={() => navigate("compose")}>
                  <UiIcon name="compose" /> Write a letter
                </button>
                <button onClick={() => navigate("postboxes")}>
                  Open my inbox <UiIcon name="inbox" />
                </button>
                <button
                  className="text-button"
                  onClick={() => navigate("privacy")}
                >
                  What can others see?
                </button>
              </div>
            </section>
            <section
              className={`hall ${list ? "list-hall" : ""}`}
              aria-label="Floating mail hall"
            >
              <div className="hall-heading">
                <div>
                  <span className="kicker">PUBLIC MAIL</span>
                  <h2>Explore the hall</h2>
                </div>
                <div className="hall-tools">
                  {d.registry && (
                    <button onClick={togglePreview}>
                      {preview ? "Leave preview" : "Try sample mail"}
                    </button>
                  )}
                  <div
                    className="public-view-switch"
                    role="group"
                    aria-label="Mail layout"
                  >
                    <button
                      aria-label="Card view"
                      title="Card view"
                      aria-pressed={!list}
                      onClick={() => setList(false)}
                    >
                      <UiIcon name="cards" />
                      <span>Cards</span>
                    </button>
                    <button
                      aria-label="List view"
                      title="List view"
                      aria-pressed={list}
                      onClick={() => setList(true)}
                    >
                      <UiIcon name="list" />
                      <span>List</span>
                    </button>
                  </div>
                  <button
                    onClick={() => void task(refresh)}
                    disabled={preview || !d.registry || !d.indexerUrl || busy}
                  >
                    <UiIcon name="refresh" /> Refresh
                  </button>
                </div>
              </div>
              {(!chain || readState === "failed") && (
                <div className="deployment-note" role="status">
                  <span className="dot" />
                  <div>
                    <strong>
                      {!d.registry
                        ? "The post office is unavailable."
                        : readState === "failed"
                          ? chain
                            ? "Mail could not be refreshed."
                            : "The spirits could not reach the post office."
                          : "The spirits are fetching your mail."}
                    </strong>
                    <p>
                      {!d.registry
                        ? "No live gifts are shown. You can explore a clearly labelled preview."
                        : readState === "failed"
                          ? chain
                            ? "Previously loaded mail is still here. Use Refresh to try again."
                            : "No live mail has loaded yet. Use Refresh to try again."
                          : "Taking a little longer? Use Refresh to try again."}
                    </p>
                  </div>
                  {!d.registry && (
                    <button onClick={togglePreview}>
                      {preview ? "Leave preview" : "Explore preview"}
                    </button>
                  )}
                </div>
              )}
              {preview && (
                <p className="preview-banner" role="status">
                  VISUAL PREVIEW · These example letters are not stored on chain
                  and contain no funded gifts. Sample amounts and collection
                  states are fictional.
                  <span>
                    Browse {sampleMail.length} public letters and gifts. Private
                    letters are not listed in the public hall.
                  </span>
                </p>
              )}
              {(chain || preview) && (
                <div className="mail-search">
                  <div className="mail-search-fields">
                    <label>
                      Find public mail
                      <input
                        type="search"
                        maxLength={160}
                        value={mailQuery}
                        placeholder="Public subject, message or letter ID"
                        onChange={(event) => {
                          setMailQuery(event.target.value);
                          setPage(1);
                        }}
                      />
                    </label>
                    <PublicMailFilters
                      value={mailFilter}
                      onChange={(value) => {
                        setMailFilter(value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <p
                    className="search-summary"
                    role="status"
                    ref={hallRange}
                    tabIndex={-1}
                  >
                    {shown.length
                      ? `Showing ${(visiblePage - 1) * 12 + 1}–${Math.min(visiblePage * 12, shown.length)} of ${shown.length} matching letters`
                      : "No matching letters"}{" "}
                    · {hallLetters.length} loaded.
                    {cursor &&
                      !preview &&
                      " Search covers loaded mail; load more to include more letters."}
                  </p>
                </div>
              )}
              {!preview && (
                <MailReadNotice
                  ids={unavailableLetterIds}
                  busy={busy || loadingMore}
                  onRetry={() => void task(refresh)}
                />
              )}
              <div className="scene">
                <div className="envelope-grid">
                  {shown
                    .slice((visiblePage - 1) * 12, visiblePage * 12)
                    .map((e) => (
                      <PublicMailCard
                        key={e.id}
                        envelope={e}
                        sample={preview ? sampleLetter(e.id) : undefined}
                        onOpen={() => {
                          setActive(e);
                          setPlain(
                            preview
                              ? sampleLetter(e.id)
                              : e.mode === "public"
                                ? (e.payload as Letter)
                                : undefined,
                          );
                        }}
                      />
                    ))}
                </div>
                {!shown.length && (
                  <div className="empty-hall">
                    <span>✉</span>
                    <p>
                      {mailQuery.trim() || mailFilter !== "all"
                        ? "No letters match this search."
                        : unavailableLetterIds.length
                          ? "Some mail is waiting for another read."
                          : readState === "failed"
                            ? "The hall could not load."
                            : chain
                              ? "The hall is quiet."
                              : "Listening for letters…"}
                      <br />
                      <small>
                        {mailQuery.trim() || mailFilter !== "all"
                          ? "Try another word or show all public mail."
                          : unavailableLetterIds.length
                            ? "Use Retry unavailable mail above. Unverified letters are never shown as available gifts."
                            : readState === "failed"
                              ? "Try Refresh above to reach the post office again."
                              : "Public letters will appear here when someone sends one. You could be the first wandering soul."}
                      </small>
                    </p>
                    {mailQuery.trim() || mailFilter !== "all" ? (
                      <button
                        onClick={() => {
                          setMailQuery("");
                          setMailFilter("all");
                          setPage(1);
                        }}
                      >
                        Clear search and filters
                      </button>
                    ) : (
                      chain &&
                      readState !== "failed" &&
                      !unavailableLetterIds.length && (
                        <button onClick={() => navigate("compose")}>
                          Write the first letter ↗
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
              {shown.length > 12 && (
                <div className="pagination">
                  <button
                    disabled={visiblePage === 1}
                    onClick={() => turnMailPage(visiblePage - 1)}
                  >
                    Previous
                  </button>
                  <span role="status">
                    Page {visiblePage} of {Math.ceil(shown.length / 12)}
                  </span>
                  <button
                    disabled={visiblePage * 12 >= shown.length}
                    onClick={() => turnMailPage(visiblePage + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
              {!preview && cursor && (
                <button
                  disabled={busy || loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore
                    ? "Loading more letters…"
                    : "Load more chain mail"}
                </button>
              )}
              <div className="mode-legend">
                <span>
                  <UiIcon name="globe" /> Public letters and gifts only
                </span>
                <button
                  className="text-button"
                  onClick={() => navigate("postboxes")}
                >
                  <UiIcon name="inbox" /> Your postboxes in My inbox ↗
                </button>
              </div>
            </section>
            <section className="how-it-works">
              <div>
                <span className="number">01</span>
                <h3>Leave a little kindness</h3>
                <p>
                  Write a public letter, share a secret link, or send to a
                  friend’s postbox. Add a test TARI gift if you like.
                </p>
              </div>
              <div>
                <span className="number">02</span>
                <h3>Let it find someone</h3>
                <p>
                  Connect Sapient when you’re ready to send. Review the gift and
                  fees, then approve in your wallet.
                </p>
              </div>
              <div>
                <span className="number">03</span>
                <h3>Make their night</h3>
                <p>
                  Read public mail without connecting. Claim a gift when you
                  choose; the sender sets aside its collection fee.
                </p>
              </div>
            </section>
          </>
        )}
        {view === "compose" && (
          <section
            className={`page-panel compose compose-window ${composerMinimized ? "minimized" : ""} ${composerExpanded ? "expanded" : ""}`}
            role="dialog"
            aria-modal="false"
            aria-labelledby="writing-desk-title"
            onKeyDown={(event) => {
              if (
                event.key === "Escape" &&
                !event.defaultPrevented &&
                !event.nativeEvent.isComposing &&
                event.nativeEvent.keyCode !== 229 &&
                !busy &&
                !(event.target as HTMLElement).closest("dialog")
              ) {
                event.preventDefault();
                event.stopPropagation();
                setComposerMinimized(true);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLButtonElement>(
                      '[aria-label="Restore composer"]',
                    )
                    ?.focus(),
                );
              }
            }}
          >
            <div className="compose-heading compose-window-heading">
              <h1 id="writing-desk-title" tabIndex={-1}>
                Compose <em>a letter.</em>
              </h1>
              <div className="compose-window-controls">
                <button
                  type="button"
                  disabled={busy}
                  aria-label={
                    composerMinimized ? "Restore composer" : "Minimize composer"
                  }
                  title={
                    composerMinimized ? "Restore composer" : "Minimize composer"
                  }
                  aria-expanded={!composerMinimized}
                  onClick={() => setComposerMinimized((value) => !value)}
                >
                  <span aria-hidden="true">
                    {composerMinimized ? "▱" : "−"}
                  </span>
                </button>
                <button
                  type="button"
                  className="compose-expand"
                  disabled={busy}
                  aria-label={
                    composerExpanded ? "Shrink composer" : "Expand composer"
                  }
                  title={
                    composerExpanded ? "Shrink composer" : "Expand composer"
                  }
                  onClick={() => {
                    setComposerExpanded((value) => !value);
                    setComposerMinimized(false);
                  }}
                >
                  <span aria-hidden="true">{composerExpanded ? "↙" : "↗"}</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Close composer"
                  title="Close composer. Unsent text stays in this tab only."
                  onClick={closeComposer}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </div>
            <div className="compose-window-content" hidden={composerMinimized}>
              {invitationPanel}
              {storageNotices}
              {error && (
                <div role="alert" className="message error">
                  {error}
                </div>
              )}
              {sealedCompose &&
                !composerMinimized &&
                wallet instanceof SapientSession &&
                sendingBox &&
                !composeViewApproved && (
                  <PrivateInboxAccess
                    wallet={wallet}
                    scope={`${current?.account.component_address}:${d.network}:${d.registry}`}
                    setup={false}
                    busy={busy}
                    task={task}
                    onGranted={() => setComposeViewApproved(true)}
                  />
                )}
              {mode === "public" && (
                <p className="public-warning" role="status">
                  Public publishing: your subject and full message will be
                  permanently readable by anyone. Choose Private mail to keep
                  the content encrypted.
                </p>
              )}
              {mode === "link" && (
                <p className="info">
                  Only people with your complete link can open this letter.
                  Anyone holding it can collect the gift once, including you.
                  Save the link before sending; lost links cannot be recovered.
                </p>
              )}
              {mode === "postbox" && !writesReady(d, "postbox", "sapient") && (
                <p className="info">
                  Private sending is unavailable. Check Settings.
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void task(prepare);
                }}
              >
                {reply && (
                  <label className="compose-from">
                    <span>From</span>
                    <select
                      aria-label={
                        sealedCompose
                          ? "Sending postbox"
                          : "Verified owned reply postbox"
                      }
                      value={reply}
                      disabled={busy}
                      onChange={(e) => {
                        setReply(e.target.value);
                        setReview(false);
                      }}
                    >
                      {owned.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nickname}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {mode === "postbox" && (
                  <div className="recipient-choice">
                    {thread && (
                      <p className="reply-context">
                        Replying to letter {short(thread.parent)} · conversation
                        links are encrypted with your message.{" "}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setThread(undefined);
                            setReview(false);
                          }}
                        >
                          Start a separate conversation
                        </button>
                      </p>
                    )}
                    {contactHome && wallet instanceof SapientSession ? (
                      <ComposerContacts
                        key={`${d.network}:${d.registry}:${contactHome.id}:${current?.account.component_address}`}
                        value={recipient}
                        box={contactHome}
                        boxes={boxes}
                        letters={letters}
                        busy={busy}
                        access={{
                          wallet,
                          chain,
                          deployment: d,
                          approved: false,
                          writeBlocked,
                          task,
                          onStatus: setStatus,
                        }}
                        onPreferences={rememberPreferences}
                        onContact={(id) => {
                          setRecipient(id);
                          setThread(undefined);
                          setReview(false);
                        }}
                      />
                    ) : (
                      <RecipientPicker
                        value={recipient}
                        groups={contactGroups}
                        busy={busy}
                        onChange={(id) => {
                          setRecipient(id);
                          setThread(undefined);
                          setReview(false);
                        }}
                      />
                    )}
                  </div>
                )}
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
                <label className="letter-body-label" htmlFor="letter-body">
                  Your letter
                </label>
                <textarea
                  id="letter-body"
                  value={body}
                  disabled={busy}
                  maxLength={unifiedOffice(d) ? 16000 : 2600}
                  aria-describedby="letter-space"
                  aria-invalid={draftTooLarge}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setReview(false);
                  }}
                  placeholder="Dear wandering soul…"
                  rows={7}
                  required
                />
                <div
                  id="letter-space"
                  className={`letter-space ${draftTooLarge ? "letter-full" : ""}`}
                >
                  {draftSize !== undefined ? (
                    <>
                      <div>
                        <span>Letter space</span>
                        <strong>
                          {draftTooLarge
                            ? "Letter is full"
                            : `${Math.max(0, Math.floor((1 - draftSize / composeLimit) * 100))}% remaining`}
                        </strong>
                      </div>
                      <progress
                        aria-label="Letter space used"
                        aria-valuetext={`${Math.min(100, Math.ceil((draftSize / composeLimit) * 100))}% used`}
                        max={composeLimit}
                        value={Math.min(draftSize, composeLimit)}
                      />
                      <p role={draftTooLarge ? "alert" : undefined}>
                        {draftTooLarge
                          ? "Shorten your subject or message before reviewing. Your text stays here."
                          : mode === "public"
                            ? "Addressing and gift details also need room in the letter."
                            : "Sealed letters also need room for encryption, addressing and gift details."}
                      </p>
                    </>
                  ) : (
                    <p>
                      Choose a registered postbox to check available letter
                      space.
                    </p>
                  )}
                </div>
                <section
                  className="compose-options"
                  aria-labelledby="delivery-options-title"
                >
                  <h3 id="delivery-options-title">Delivery options</h3>
                  <div
                    className="mode-switch"
                    role="group"
                    aria-label="Mail mode"
                  >
                    {(["postbox", "link", "public"] as const).map((m) => (
                      <button
                        type="button"
                        aria-pressed={mode === m}
                        disabled={busy}
                        className={mode === m ? "selected" : ""}
                        onClick={() => {
                          draftSequence.current += 1;
                          setMode(m);
                          setThread(undefined);
                          setReview(false);
                          setPrepared(undefined);
                        }}
                        key={m}
                      >
                        {m === "public"
                          ? "✧ Public mail"
                          : m === "link"
                            ? "⌘ Private link"
                            : "▥ Private mail"}
                      </button>
                    ))}
                  </div>
                  <PrivacyView
                    mode={mode}
                    compact
                    sealed={sealedCompose}
                    payments={privatePaymentsEnabled}
                  />
                  {!sealedCompose && (
                    <>
                      <div className="form-row">
                        <AmountInput
                          label="Gift amount (optional)"
                          value={gift}
                          disabled={busy}
                          onChange={(value) => {
                            setGift(value);
                            setReserve(
                              value && BigInt(value) > 0n
                                ? reserve === "0"
                                  ? "100000"
                                  : reserve
                                : "0",
                            );
                            setReview(false);
                          }}
                        />
                        {gift && BigInt(gift) > 0n && (
                          <p className="fine-print">
                            Collection postage is included automatically:{" "}
                            {tari(reserve)} TARI, separate from the gift.
                          </p>
                        )}
                      </div>
                      <p className="fine-print">
                        The recipient gets the full gift. You fund collection
                        fees separately. Gifts have no expiry or refunds; unused
                        collection funds stay locked. Use 0 for a letter without
                        a gift.
                      </p>
                    </>
                  )}
                  {!sealedCompose && (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={!!reply}
                        disabled={busy || !owned.length}
                        onChange={(e) => {
                          setReply(e.target.checked ? owned[0]?.id || "" : "");
                          setReview(false);
                          setPrepared(undefined);
                          setLinkSaved(false);
                        }}
                      />{" "}
                      Include my postbox for replies (optional)
                    </label>
                  )}
                  {sealedCompose && (
                    <div className="sent-copy-choice">
                      {privatePaymentsEnabled && (
                        <div className="private-payment-composer">
                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={requestPayment}
                              disabled={busy || !current?.address}
                              onChange={(e) => {
                                setRequestPayment(e.target.checked);
                                setRequestNonce(
                                  hex(
                                    crypto.getRandomValues(new Uint8Array(32)),
                                  ),
                                );
                                setReview(false);
                                setPrepared(undefined);
                              }}
                            />
                            Request a private payment
                          </label>
                          {requestPayment && (
                            <>
                              <AmountInput
                                label="Requested private payment"
                                value={requestedAmount}
                                disabled={busy}
                                onChange={(value) => {
                                  setRequestedAmount(value);
                                  setReview(false);
                                  setPrepared(undefined);
                                }}
                              />
                              <p className="fine-print">
                                Your Sapient receiving address and amount will
                                be encrypted inside this letter. Sending the
                                request pays postage only; your correspondent
                                separately reviews and approves payment.
                              </p>
                            </>
                          )}
                        </div>
                      )}
                      <p className="fine-print">
                        Conversation-specific reply keys are automatic. Your
                        wallet signer and transaction timing remain public.
                      </p>
                      {!sendingBox && (
                        <button
                          type="button"
                          onClick={() => navigate("postboxes")}
                        >
                          Create or choose my sending postbox
                        </button>
                      )}
                    </div>
                  )}
                  {mode !== "public" && !sealedCompose && unifiedOffice(d) && (
                    <div className="sent-copy-choice">
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={saveSent}
                          disabled={busy || !sentDescriptor}
                          onChange={(e) => {
                            setSaveSent(e.target.checked);
                            setReview(false);
                            setPrepared(undefined);
                            setLinkSaved(false);
                          }}
                        />
                        Save an encrypted copy in Sent
                      </label>
                      <p className="fine-print">
                        {sentDescriptor
                          ? "Your sending postbox can recover this copy with Sapient on another device. It uses extra on-chain letter space; no extra wallet approval is needed."
                          : "Include your Sapient postbox for replies above to save recoverable Sent mail."}
                      </p>
                    </div>
                  )}
                  {wallet && wallet.accounts.length > 1 && (
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
                            {a.account.name} ·{" "}
                            {short(a.account.component_address)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {wallet instanceof SapientSession &&
                    wallet.privateFeeCapable &&
                    d.evidence.nativePrivatePostage === true && (
                      <label>
                        Postage source
                        <select
                          value={postage}
                          disabled={busy}
                          onChange={(e) => {
                            setPostage(
                              e.target.value as "private" | "transparent",
                            );
                            setReview(false);
                          }}
                        >
                          <option value="private">
                            Private TARI · native Sapient postage
                          </option>
                          <option value="transparent">
                            Public TARI · visible account funding
                          </option>
                        </select>
                      </label>
                    )}
                </section>
                <FeeAdjustment
                  problem={
                    feeProblem?.operation === "publish" ? feeProblem : undefined
                  }
                  label="Sending fee limit"
                  value={fee}
                  busy={busy}
                  onChange={(value) => {
                    setFee(value);
                    setReview(false);
                  }}
                />
                <div className="actions">
                  <button
                    type="submit"
                    className="primary"
                    disabled={
                      busy ||
                      draftTooLarge ||
                      (mode === "postbox" && (!recipient || !d.registry))
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
                  {draftLetter.privatePayment && (
                    <PrivatePaymentCard payment={draftLetter.privatePayment} />
                  )}
                  <dl className="receipt">
                    <div>
                      <dt>Recipient receives</dt>
                      <dd>{tari(gift)} TARI</dd>
                    </div>
                    <div>
                      <dt>Collection funds</dt>
                      <dd>{tari(reserve)} TARI</dd>
                    </div>
                    <div>
                      <dt>Sending fee limit</dt>
                      <dd>{tari(fee)} TARI per attempt</dd>
                    </div>
                    <div>
                      <dt>Gift + collection funds</dt>
                      <dd>
                        {tari((BigInt(gift) + BigInt(reserve)).toString())} TARI
                      </dd>
                    </div>
                    <div>
                      <dt>Replies</dt>
                      <dd>
                        {prepared.envelope.replyPostbox ? (
                          <code className="postbox-address">
                            {prepared.envelope.replyPostbox}
                          </code>
                        ) : (
                          "No reply postbox"
                        )}
                      </dd>
                    </div>
                    {prepared.envelope.mode !== "public" && (
                      <div>
                        <dt>Sent folder</dt>
                        <dd>
                          {prepared.sealedReview || sentCopy(prepared.envelope)
                            ? "Encrypted copy saved with this letter"
                            : "No recoverable sender copy"}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {prepared.envelope.replyPostbox && !prepared.sealedReview && (
                    <p className="fine-print">
                      Your included reply postbox ID is public, including on
                      sealed letters.
                    </p>
                  )}
                  <p>
                    Sapient will show the sending fee before you approve.{" "}
                    {!prepared.sealedReview &&
                      "Collection works only if the funds you set aside cover it."}
                  </p>
                  <p className="fine-print">
                    {prepared.sealedReview
                      ? "Nothing has been published yet. Subject, body, recipient and reply addressing are encrypted. The transaction signer, timing, office and size bucket remain public."
                      : "Nothing has been published or funded yet. Encryption includes the subject. Private gift amounts and routing metadata remain visible on chain."}
                  </p>
                  <p className="info">
                    {postage === "private"
                      ? "Postage uses private TARI in Sapient, with no automatic public fallback. The wallet builds the fee proof after you approve; its stock API cannot privately simulate this custom letter in advance. A rejected transaction may still pay fees." +
                        (prepared.sealedReview
                          ? " This letter has no payment attachment."
                          : " Attached gifts still use the public gift vault.")
                      : prepared.sealedReview
                        ? "Postage uses public TARI. Sapient simulates this letter before asking you to approve. No payment is attached."
                        : "Postage and attached gifts use public TARI. Sapient simulates this letter before asking you to approve."}
                  </p>
                  {prepared.capability && d.registry && (
                    <section
                      className="secret-link-save"
                      aria-labelledby="save-link-title"
                    >
                      <h3 id="save-link-title">Keep your secret safe.</h3>
                      <p>
                        Save this complete link before sending. It opens after
                        delivery confirms. Anyone with it can open the letter
                        and collect its gift; MoonMail cannot recover it for
                        you.
                      </p>
                      <CopyField
                        label="Private link to save"
                        buttonLabel="Copy secret link"
                        copiedMessage="Private link copied. Save it somewhere safe before sending."
                        disabled={busy}
                        multiline
                        value={createGiftLink(
                          new URL(import.meta.env.BASE_URL, location.href).href,
                          {
                            id: prepared.envelope.id,
                            capability: prepared.capability,
                            context: d,
                          },
                        )}
                      />
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={linkSaved}
                          disabled={busy}
                          onChange={(e) => setLinkSaved(e.target.checked)}
                        />
                        I saved my private link somewhere safe
                      </label>
                    </section>
                  )}
                  {mode === "public" && (
                    <label className="public-consent">
                      <input
                        type="checkbox"
                        checked={publicConfirmed}
                        disabled={busy}
                        onChange={(e) => setPublicConfirmed(e.target.checked)}
                      />
                      I choose to publish this subject, message and any gift
                      publicly on Ootle.
                    </label>
                  )}
                  <button
                    className="primary"
                    disabled={
                      (mode === "public" && !publicConfirmed) ||
                      !wallet ||
                      !chain ||
                      !writesReady(d, mode, "sapient") ||
                      writeBlocked ||
                      (!!prepared.capability && !linkSaved) ||
                      busy
                    }
                    onClick={() =>
                      void task(async () => {
                        if (!wallet || !chain || !current) return;
                        if (
                          prepared.envelope.mode === "public" &&
                          !publicConfirmed
                        )
                          throw new Error(
                            "Choose public publication explicitly before continuing",
                          );
                        const id =
                          prepared.sealedReview &&
                          wallet instanceof SapientSession
                            ? await chain
                                .sealedOffice()
                                .publish(
                                  wallet,
                                  prepared.sealedReview,
                                  fee,
                                  browserStorage,
                                  postage,
                                )
                            : await chain.publish(
                                wallet,
                                current,
                                prepared.envelope,
                                fee,
                                browserStorage,
                                postage,
                              );
                        navigate("activity", true);
                        setStatus(
                          `Letter submitted. Check its confirmation below before sharing. Transaction: ${id}.`,
                        );
                      })
                    }
                  >
                    {mode === "public"
                      ? "Publish publicly"
                      : "Send encrypted letter"}
                  </button>
                  {!wallet && (
                    <button onClick={() => setConnect(true)} disabled={busy}>
                      Connect Sapient to send
                    </button>
                  )}
                  {!chain && (
                    <p className="review-note">
                      {readState === "failed"
                        ? "The post office connection failed. Try Refresh on Public mail."
                        : "Waiting for the post office connection. Try Refresh on Public mail if this takes a while."}
                    </p>
                  )}
                  {error && <p className="review-note">{error}</p>}
                  {!writesReady(d, mode, "sapient") && (
                    <p className="info">
                      Sending is currently unavailable for these post office
                      settings.
                    </p>
                  )}
                </div>
              )}
              <p className="compose-session-note">
                Unsent text stays in this tab only. Reloading loses it; no draft
                is saved.
              </p>
            </div>
          </section>
        )}
        {mailboxView && (
          <Postboxes
            autoPromptPrivateAccess={view !== "compose"}
            privateAccessActive={view !== "compose" || composerMinimized}
            searchTarget={mailboxSearchTarget}
            feeProblem={feeProblem}
            wallet={wallet}
            chain={chain}
            deployment={d}
            boxes={boxes}
            letters={letters}
            busy={busy}
            task={task}
            onStatus={setStatus}
            onConnect={() => setConnect(true)}
            onSubmitted={() => {
              if (view !== "postboxes") navigate("postboxes", true);
            }}
            onPublic={() => navigate("hall")}
            onPrivacy={() => navigate("privacy")}
            writeBlocked={writeBlocked}
            onOpen={(e) => void task(() => openPostbox(e))}
            onClose={closeLetter}
            onCompose={(box) =>
              !subject && !body && gift === "0"
                ? composeFromPostbox(box)
                : navigate("compose")
            }
            onNewLetter={() => navigate("compose")}
            onReply={(e, letter) => {
              if (e.replyPostbox)
                beginAddressedDraft(e.replyPostbox, letter.subject, e, letter);
            }}
            onPreferences={rememberPreferences}
            onRead={readPostbox}
            onReadSent={readSent}
            sentPlain={sentPlain}
            plain={mailboxPlain}
            activeId={active?.mode === "postbox" ? active.id : undefined}
            onReaderTarget={setMailboxReaderTarget}
            onRefresh={refresh}
            onMore={loadMore}
            unavailableLetterIds={unavailableLetterIds}
            loadingMore={loadingMore}
            hasMore={!!cursor}
            onDiscover={
              d.contractProtocol === "unified-2" ? discoverSealed : undefined
            }
            discovery={sealedProgress}
            privateAccessRevision={privateAccessRevision}
          />
        )}
        {view === "ledger" && (
          <section className="page-panel">
            <span className="kicker">THE ADDRESS LEDGER</span>
            <h1>
              Find a <em>familiar spirit.</em>
            </h1>
            <p>
              Find a friend’s registered postbox. Check the ID with your friend:
              different people can use the same name.
            </p>
            <label>
              Find a postbox
              <input
                type="search"
                value={directoryQuery}
                onChange={(e) => setDirectoryQuery(e.target.value)}
                placeholder="Search a name or postbox ID"
              />
            </label>
            <div className="directory">
              {boxes
                .filter((p) =>
                  `${p.nickname} ${p.id}`
                    .toLowerCase()
                    .includes(directoryQuery.toLowerCase()),
                )
                .map((p) => (
                  <article className="directory-card" key={p.id}>
                    <span aria-hidden="true">✉</span>
                    <div>
                      <h2>{p.nickname}</h2>
                      <p className="postbox-address">{p.id}</p>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() => beginAddressedDraft(p.id)}
                    >
                      Write to {p.nickname} ↗
                    </button>
                  </article>
                ))}
            </div>
            {!boxes.some((p) =>
              `${p.nickname} ${p.id}`
                .toLowerCase()
                .includes(directoryQuery.toLowerCase()),
            ) && (
              <div className="quiet-state">
                <h2>
                  {directoryQuery
                    ? "No spirits by that name."
                    : "The directory is quiet."}
                </h2>
                <p>
                  {directoryQuery
                    ? "Try another name or ask your friend for their postbox ID."
                    : "Ask a friend for their postbox invitation, or create your own."}
                </p>
              </div>
            )}
            <button
              onClick={() => {
                setMode("postbox");
                navigate("compose");
              }}
            >
              Back to the writing desk
            </button>
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
              wallet. No MoonMail server.
            </p>
            <div className="info">
              You’re using the Sapient post office on Esmeralda. These are test
              coins. Choose Esmeralda in Sapient before connecting.
            </div>
            <button disabled={busy} onClick={() => void task(restoreOffice)}>
              Restore default settings
            </button>
            <details className="advanced">
              <summary>Advanced connection settings</summary>
              <p className="fine-print">
                Changing these settings clears the reviewed wallet and gift
                permissions. Only use contract addresses you trust.
              </p>
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
                  onChange={(e) =>
                    changeDeployment({ resource: e.target.value })
                  }
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
                  Public network settings are ready to check. MoonMail still
                  needs its own deployed registry and two template addresses
                  before live mail can load. Addresses from a local test chain
                  do not work on the public testnet.
                </p>
              )}
              <label>
                Registry component
                <input
                  value={d.registry}
                  disabled={busy}
                  onChange={(e) =>
                    changeDeployment({ registry: e.target.value })
                  }
                />
              </label>
              <label>
                Registry template identity
                <input
                  value={d.template}
                  disabled={busy}
                  onChange={(e) =>
                    changeDeployment({ template: e.target.value })
                  }
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
                The indexer supplies public mail data. MoonMail checks contract
                identities but does not verify consensus proofs. Keep wallet
                secrets and private links out of these settings.
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
            </details>
          </section>
        )}
        {view === "activity" && (
          <section className="page-panel activity-page">
            <span className="kicker">THE DELIVERY BOOK</span>
            <h1 id="activity-title" tabIndex={-1}>
              Your <em>activity.</em>
            </h1>
            <p>
              Check that your letters, gifts and postbox changes have arrived.
              This history is saved in this browser; your wallet keeps the
              transaction records. Incoming letters live in My inbox; this book
              tracks your sending, collections and postbox approvals.
            </p>
            <div className="activity-preview-control">
              <button
                onClick={() => setShowSampleActivity(!showSampleActivity)}
              >
                {showSampleActivity
                  ? "Return to my activity"
                  : "See sample activity"}
              </button>
              <span>See how a busy delivery book looks.</span>
            </div>
            {showSampleActivity && (
              <p className="info sample-activity-notice" role="status">
                SAMPLE ACTIVITY · These {sampleActivity.length} fictional
                actions are separate from your real history. No transactions are
                sent, checked or resumed. References and times are examples.
              </p>
            )}
            {autoChecking && (
              <p className="info">
                Checking delivery automatically. You can leave this page; your
                submitted transaction keeps going.
              </p>
            )}
            {!showSampleActivity &&
              !deliveryHistory.error &&
              !deliveries.length && (
                <div className="quiet-state">
                  <span aria-hidden="true">✧</span>
                  <h2>No deliveries yet.</h2>
                  <p>
                    Your next little act of kindness starts at the writing desk.
                  </p>
                  <button onClick={() => navigate("compose")}>
                    Write a letter ↗
                  </button>
                </div>
              )}
            {(showSampleActivity || deliveries.length > 0) && (
              <ActivityBook
                key={`${d.network}:${d.registry}:${showSampleActivity}`}
                records={showSampleActivity ? sampleActivity : deliveries}
                sample={showSampleActivity}
                busy={busy}
                canCheck={!!chain}
                canResume={!writeBlocked && wallet instanceof SapientSession}
                publicTitles={showSampleActivity ? sampleTitles : publicTitles}
                mailDetails={Object.fromEntries(
                  (showSampleActivity ? sampleMail : letters).map(
                    ({ id, mode, gift, reserve }) => [
                      id,
                      { mode, gift, reserve },
                    ],
                  ),
                )}
                onCheck={(p) => void checkActivity(p)}
                onResume={(p) => void resumeActivity(p)}
                onRead={(id) => {
                  const letter = letters.find(
                    (e) => e.id === id && e.mode === "public",
                  );
                  if (!letter) return;
                  closeLetter();
                  setActive(letter);
                  setPlain(letter.payload as Letter);
                }}
                onInbox={() => navigate("postboxes")}
                onPot={() => navigate("pot")}
              />
            )}
            {privateLink && (
              <div className="confirmed-link">
                <CopyField
                  label="Confirmed private link"
                  buttonLabel="Copy private link"
                  copiedMessage="Private link copied. Share it only with the intended recipient."
                  multiline
                  value={privateLink}
                />
              </div>
            )}
          </section>
        )}
        {view !== "compose" && storageNotices}
        {error && view !== "compose" && (
          <div role="alert" className="message error">
            {error}
          </div>
        )}
        {status && status !== "Mail is up to date." && view !== "compose" && (
          <div role="status" className="message status">
            {status}
          </div>
        )}
      </main>
      <footer>
        <span className="footer-brand">✦ MOONMAIL</span>
        <p>Your words, under cover of night.</p>
        <button onClick={() => navigate("network")}>Settings ↗</button>
        <span className="footer-note">ESMERALDA TESTNET · SAPIENT</span>
      </footer>
      {connect && (
        <div className="modal-backdrop">
          <section
            className="modal wallet-dialog"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-labelledby="wallet-title"
          >
            <button
              className="close"
              aria-label={
                wallet && current
                  ? "Close wallet details"
                  : "Close wallet connection"
              }
              onClick={() => {
                connectionSequence.current += 1;
                setConnect(false);
              }}
            >
              ×
            </button>
            <div className="wallet-welcome-mark" aria-hidden="true">
              <UiIcon name="mail" />
              <span className="wallet-welcome-moon" />
            </div>
            <span className="kicker">YOUR SAPIENT WALLET</span>
            <h2 id="wallet-title">
              {wallet && current ? "Your Sapient wallet" : "Connect Sapient"}
            </h2>
            {wallet && current ? (
              <div className="wallet-summary">
                <span className="wallet-connected-badge">
                  <UiIcon name="check" /> Connected ·{" "}
                  {d.network === 38 ? "Esmeralda" : "Igor"} testnet
                </span>
                <p>
                  Use this address to receive test TARI. Reading private mail
                  and spending funds still need their own approvals in Sapient.
                </p>
                <CopyField
                  label="Your receiving address"
                  value={current.address}
                  buttonLabel="Copy receiving address"
                  copiedMessage="Receiving address copied."
                  multiline
                />
                {wallet instanceof SapientSession && (
                  <WalletFunds wallet={wallet} disabled={busy} />
                )}
                <details>
                  <summary>Receiving account details</summary>
                  <p className="fine-print">
                    Some applications also ask for your account component when
                    sending to an existing account.
                  </p>
                  <CopyField
                    label="Your receiving account"
                    value={current.account.component_address}
                    buttonLabel="Copy receiving account"
                    copiedMessage="Receiving account copied."
                    multiline
                  />
                </details>
                <button
                  disabled={busy}
                  onClick={() => {
                    disconnect();
                    setConnect(false);
                  }}
                >
                  Disconnect wallet
                </button>
              </div>
            ) : (
              <WalletConnection
                available={sapientAvailable}
                busy={busy}
                network={
                  d.network === 38
                    ? "Esmeralda"
                    : d.network === 36
                      ? "Igor"
                      : "the required"
                }
                onCheck={() => {
                  const available = !!sapientProvider();
                  setSapientAvailable(available);
                  return available;
                }}
                onConnect={async () => {
                  setBusy(true);
                  setError("");
                  setFeeProblem(undefined);
                  try {
                    const sequence = ++connectionSequence.current;
                    const w = await SapientSession.connect(d.network);
                    if (sequence !== connectionSequence.current) {
                      w.invalidate();
                      return;
                    }
                    if (wallet instanceof SapientSession) wallet.invalidate();
                    else wallet?.disconnect();
                    restoreBlocked.current = false;
                    try {
                      sessionStorage.setItem(
                        "ghostdrop:sapient-resume:v1",
                        String(d.network),
                      );
                    } catch {
                      /* Reconnect manually if storage is unavailable. */
                    }
                    setWallet(w);
                    setAccount(0);
                    setConnect(false);
                    setStatus(
                      "Connected to Sapient. Transactions require your wallet approval.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
            {wallet && current && error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
      {active &&
        !connect &&
        (!inlinePostboxReader || mailboxReaderTarget) &&
        (() => {
          const reader = (
            <div
              className={
                inlinePostboxReader ? "mailbox-reader-frame" : "modal-backdrop"
              }
            >
              <section
                className={`letter-modal ${inlinePostboxReader ? "mailbox-letter" : "modal"} ${active.mode === "public" ? "public-letter-reader" : ""}`}
                role={inlinePostboxReader ? "region" : "dialog"}
                aria-modal={inlinePostboxReader ? undefined : true}
                tabIndex={-1}
                aria-labelledby="letter-title"
              >
                <button
                  className="close"
                  aria-label="Close letter"
                  disabled={busy}
                  onClick={closeLetter}
                >
                  ×
                </button>
                <span className="kicker">
                  {activeSample
                    ? "VISUAL PREVIEW"
                    : active.mode === "public"
                      ? "PUBLIC LETTER"
                      : active.mode === "postbox"
                        ? "PRIVATE POSTBOX LETTER"
                        : "SEALED INVITATION"}
                </span>
                <h2 id="letter-title" tabIndex={-1}>
                  {plain?.subject || "A sealed little secret"}
                </h2>
                {active.mode === "public" && (
                  <div className="public-reader-meta">
                    <UiIcon name="globe" />
                    <span>
                      {activeSample
                        ? "Sample letter · no real funds"
                        : "Anyone can read this letter"}
                    </span>
                    <span>Reading never collects a gift</span>
                  </div>
                )}
                {inlinePostboxReader && (
                  <div className="letter-participants">
                    <span className="letter-avatar" aria-hidden="true">
                      <UiIcon name="mail" />
                    </span>
                    <div>
                      <strong>
                        {boxes.find(
                          (p) =>
                            p.id === active.replyPostbox &&
                            p.controller === active.sender,
                        )?.nickname || `Wallet ${short(active.sender)}`}
                      </strong>
                      <p>
                        To{" "}
                        {boxes.find(
                          (p) =>
                            p.id === active.recipientPostbox &&
                            p.controller === active.claimAuthority,
                        )?.nickname || "your postbox"}
                      </p>
                    </div>
                    <span className="letter-private-label">
                      <UiIcon name="privacy" />
                      Encrypted letter
                    </span>
                  </div>
                )}
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
                    {active.mode === "postbox" &&
                      wallet?.accounts.some(
                        (account) =>
                          account.account.owner_public_key ===
                          active.claimAuthority,
                      ) && (
                        <>
                          <button
                            ref={inboxFocus.ref}
                            aria-describedby={
                              error ? "letter-error" : undefined
                            }
                            disabled={busy || !chain}
                            onClick={() =>
                              void task(() => {
                                const opening = openPostbox(active);
                                inboxFocus.remember();
                                return opening;
                              })
                            }
                          >
                            {busy
                              ? "Opening your letter…"
                              : "Retry opening letter"}
                          </button>
                          <p className="fine-print">
                            If Sapient needs view permission, close this letter
                            and approve postbox view access in My inbox first.
                          </p>
                        </>
                      )}
                  </div>
                )}
                {plain?.privatePayment &&
                  active.deliveryProtocol === "mm-sealed-2" && (
                    <PrivatePaymentCard
                      payment={plain.privatePayment}
                      busy={busy}
                      onPay={
                        privatePaymentsEnabled &&
                        plain.privatePayment.kind === "request" &&
                        active.localAccess?.inbox &&
                        !!current &&
                        active.claimAuthority ===
                          current.account.owner_public_key
                          ? () => {
                              setPaymentReview(active.id);
                              setPaymentNotice("");
                            }
                          : undefined
                      }
                      onImport={
                        privatePaymentsEnabled &&
                        plain.privatePayment.kind === "receipt" &&
                        active.localAccess?.inbox &&
                        current?.address === plain.privatePayment.destination
                          ? () => void task(importActivePayment)
                          : undefined
                      }
                      review={paymentReview === active.id}
                      fee={paymentFee}
                      feeProblem={
                        feeProblem?.operation === "private-payment"
                          ? feeProblem
                          : undefined
                      }
                      onFee={setPaymentFee}
                      onConfirm={() => void task(payActiveRequest)}
                      onCancel={() => setPaymentReview(undefined)}
                      notice={paymentNotice}
                    />
                  )}
                {active.replyPostbox &&
                  boxes.some((p) => p.id === active.replyPostbox) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        beginAddressedDraft(
                          active.replyPostbox!,
                          plain?.subject || "Your letter",
                          active,
                          plain,
                        )
                      }
                    >
                      Reply to this spirit ↗
                    </button>
                  )}
                <button aria-pressed={ghost} onClick={() => setGhost(!ghost)}>
                  ◈ Ghost View
                </button>
                {ghost && (
                  <div className="ghost-view">
                    <h3>
                      {activeSample
                        ? "Example payload"
                        : "Stored chain payload"}
                    </h3>
                    <pre>{JSON.stringify(active.payload, null, 2)}</pre>
                    <p>
                      {active.deliveryProtocol === "mm-sealed-2"
                        ? "Subject, body, recipient and reply addressing are encrypted inside this payload. Your transaction signer, timing, office and padded size bucket remain public. Access-slot keys and local decrypted addressing are not published here. Any private payment request or recovery record is encrypted too; a payment uses separate approvals, with signers, fees, commitments and timing still observable."
                        : "Encryption hides the subject and body of sealed mail. The existing gift vault uses revealed test TARI: amounts, sender/controller keys, timing and routing remain observable. Ghost View does not provide payment anonymity."}
                    </p>
                  </div>
                )}
                {!activeSample && active.mode === "public" && (
                  <PublicLetterShare envelope={active} />
                )}
                {privateLink && (
                  <CopyField
                    label="Private link for this letter"
                    buttonLabel="Copy private link"
                    copiedMessage="Private link copied. Anyone with it can open this letter and collect an available gift."
                    multiline
                    value={privateLink}
                  />
                )}
                {!activeSample && BigInt(active.gift) > 0n && (
                  <div className="claim-panel">
                    {busy && claimReview && (
                      <p role="status">
                        {active.mode === "postbox"
                          ? "Check Sapient for an approval request."
                          : "Submitting gift collection."}{" "}
                        Keep this letter open until the outcome is clear.
                      </p>
                    )}
                    <h3>
                      {active.claimed
                        ? "Gift collected"
                        : collectionPending && !busy
                          ? "Collection pending"
                          : "Collect the gift"}
                    </h3>
                    <p>
                      {active.claimed || collectionPending
                        ? "Gift amount:"
                        : "You receive"}{" "}
                      {tari(active.gift)} TARI. The sender set aside{" "}
                      {tari(active.reserve)} TARI for collection fees.
                    </p>
                    {active.claimed && (
                      <p role="status" className="fine-print">
                        This gift has already been collected. You can still read
                        the letter.
                      </p>
                    )}
                    {collectionPending && !busy && (
                      <div role="status" className="info">
                        <p>Your collection is awaiting confirmation.</p>
                        <p className="fine-print">
                          A collected gift alone cannot confirm which account
                          received it. Check the original transaction in
                          Activity and your receiving account’s history before
                          trying again.
                        </p>
                        <button
                          onClick={() => {
                            focusActivity.current = true;
                            closeLetter();
                            navigate("activity");
                          }}
                        >
                          Check collection in Activity
                        </button>
                      </div>
                    )}
                    {!active.claimed && (!collectionPending || busy) && (
                      <>
                        {!wallet && (
                          <div className="info">
                            <p>
                              Have Sapient? Connect to choose your receiving
                              account automatically. You can also collect using
                              a compatible address below.
                            </p>
                            <button
                              disabled={busy || !!claimReview}
                              onClick={() => setConnect(true)}
                            >
                              Connect Sapient to receive
                            </button>
                          </div>
                        )}
                        {wallet && (
                          <div className="mode-switch">
                            <button
                              disabled={busy || !!claimReview}
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
                              disabled={busy || !!claimReview || !wallet}
                              aria-pressed={destMode === "wallet"}
                              onClick={() => {
                                setDestMode("wallet");
                                if (current) {
                                  setAddress(current.address);
                                  setDestination(
                                    current.account.component_address,
                                  );
                                }
                              }}
                            >
                              Choose from connected wallet
                            </button>
                          </div>
                        )}
                        {destMode === "wallet" &&
                          wallet &&
                          wallet.accounts.length > 1 && (
                            <label>
                              Receiving account
                              <select
                                disabled={busy || !!claimReview}
                                onChange={(e) => {
                                  const a =
                                    wallet.accounts[Number(e.target.value)];
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
                        {destMode === "wallet" &&
                          wallet?.accounts.length === 1 && (
                            <div className="receiving-account">
                              <p>Receiving in your connected Sapient account</p>
                              <code>{address}</code>
                            </div>
                          )}
                        {destMode === "manual" && (
                          <>
                            <label>
                              Ootle receiving address
                              <input
                                disabled={busy || !!claimReview}
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                              />
                            </label>
                          </>
                        )}
                        <p className="fine-print">
                          {active.mode === "postbox" &&
                          wallet?.kind === "sapient" &&
                          active.claimProtocol === "sapient-proof-1" &&
                          postboxClaimsReady(d, "sapient")
                            ? `Sapient will ask you to approve a proof for this gift and destination. MoonMail then submits the claim. You receive ${tari(active.gift)} TARI; collection fees come from the funded reserve of up to ${tari(active.reserve)} TARI. Your wallet needs no coins for this claim. The approval expires after at most 10 network epochs.`
                            : active.mode === "postbox" &&
                                wallet?.kind === "sapient"
                              ? "Postbox collection is not enabled for this deployment. Your connected wallet must control this postbox."
                              : "Paste your Ootle wallet address. MoonMail checks the receiving account for you. Collection fees come from the sender’s reserve."}
                        </p>
                        {!claimReview && (
                          <button
                            ref={claimReviewTrigger}
                            className="primary"
                            disabled={
                              busy ||
                              !chain ||
                              !address ||
                              writeBlocked ||
                              !(active.mode === "postbox"
                                ? postboxClaimsReady(
                                    d,
                                    wallet?.kind ?? "sapient",
                                  )
                                : claimsReady(d)) ||
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
                                const sequence = openSequence.current;
                                const reviewed = {
                                  address: address.trim(),
                                  destination:
                                    destMode === "wallet"
                                      ? destination.trim()
                                      : "",
                                  createAccount: false,
                                };
                                setCheckingGift(true);
                                try {
                                  let latest: Envelope;
                                  try {
                                    latest = await chain.readLetter(
                                      active.id,
                                      active.component,
                                    );
                                  } catch {
                                    if (sequence !== openSequence.current)
                                      return;
                                    throw new Error(
                                      "Could not check this gift right now. Your letter and destination are still here; try Review gift collection again.",
                                    );
                                  }
                                  if (sequence !== openSequence.current) return;
                                  setActive(latest);
                                  setLetters((loaded) =>
                                    loaded.map((letter) =>
                                      letter.id === latest.id &&
                                      letter.component === latest.component
                                        ? latest
                                        : letter,
                                    ),
                                  );
                                  if (!latest.claimed) {
                                    const resolved =
                                      destMode === "manual"
                                        ? await chain.resolveReceivingAddress(
                                            reviewed.address,
                                            latest.mode !== "postbox",
                                          )
                                        : reviewed;
                                    if (sequence !== openSequence.current)
                                      return;
                                    setClaimReview(resolved);
                                  }
                                } finally {
                                  setCheckingGift(false);
                                }
                              })
                            }
                          >
                            {checkingGift
                              ? "Checking gift and address…"
                              : "Review gift collection"}
                          </button>
                        )}
                        {claimReview && (
                          <section
                            className="collection-review"
                            aria-labelledby="collection-review-title"
                          >
                            <span className="kicker">ONE LAST LOOK</span>
                            <h3 id="collection-review-title" tabIndex={-1}>
                              Send this gift to your wallet?
                            </h3>
                            <dl>
                              <dt>You receive</dt>
                              <dd>{tari(active.gift)} test TARI</dd>
                              <dt>Collection fee limit</dt>
                              <dd>
                                {tari(active.reserve)} TARI, from the sender’s
                                reserve
                              </dd>
                              <dt>Network</dt>
                              <dd>
                                {d.network === 38
                                  ? "Esmeralda testnet"
                                  : `Test network ${d.network}`}
                              </dd>
                              <dt>Receiving address</dt>
                              <dd>
                                <code>{claimReview.address}</code>
                              </dd>
                            </dl>
                            {claimReview.createAccount && (
                              <p className="fine-print">
                                MoonMail will set up receiving for this address
                                using the gift’s fee reserve.
                              </p>
                            )}
                            <p className="fine-print">
                              {active.mode === "postbox"
                                ? "Confirming asks Sapient to approve a proof for this gift and destination. Only then can MoonMail submit the collection."
                                : "Confirming submits the collection using this destination. No wallet connection or extra signature is required."}{" "}
                              The gift goes to the address shown above. Check it
                              carefully before confirming.
                            </p>
                            <div className="collection-actions">
                              <button
                                disabled={busy}
                                onClick={() => setClaimReview(undefined)}
                              >
                                Change destination
                              </button>
                              <button
                                ref={collectionFocus.ref}
                                aria-describedby={
                                  error ? "letter-error" : undefined
                                }
                                className="primary"
                                disabled={
                                  busy ||
                                  writeBlocked ||
                                  !chain ||
                                  active.claimed
                                }
                                onClick={() =>
                                  void task(async () => {
                                    collectionFocus.remember();
                                    const reviewed = claimReview;
                                    if (!chain || !reviewed) return;
                                    const owner = wallet?.accounts.find(
                                      (a) =>
                                        a.account.owner_public_key ===
                                        active.claimAuthority,
                                    );
                                    const id =
                                      active.mode === "postbox" &&
                                      wallet &&
                                      owner
                                        ? await chain.claimPostbox(
                                            wallet,
                                            owner,
                                            active,
                                            reviewed.address,
                                            reviewed.destination,
                                            browserStorage,
                                          )
                                        : await chain.claim(
                                            active,
                                            reviewed.address,
                                            reviewed.destination,
                                            secret.current,
                                            browserStorage,
                                            reviewed.createAccount,
                                          );
                                    setClaimReview(undefined);
                                    setStatus(
                                      `Gift collection submitted. Close this letter and check Activity for confirmation. Transaction: ${id}.`,
                                    );
                                  })
                                }
                              >
                                {busy
                                  ? "Collecting…"
                                  : "Confirm & collect gift"}
                              </button>
                            </div>
                          </section>
                        )}
                      </>
                    )}
                  </div>
                )}
                {status.startsWith("Gift collection submitted") && (
                  <p className="fine-print">{status}</p>
                )}
                {error && (
                  <p id="letter-error" role="alert" className="error">
                    {error}
                  </p>
                )}
                <button
                  disabled={busy}
                  onClick={() => {
                    closeLetter();
                    navigate("activity");
                  }}
                >
                  View delivery activity ↗
                </button>
              </section>
            </div>
          );
          return inlinePostboxReader && mailboxReaderTarget
            ? createPortal(reader, mailboxReaderTarget)
            : reader;
        })()}
    </div>
  );
}

function PublicLetterShare({ envelope }: { envelope: Envelope }) {
  let link = "";
  try {
    link = createPublicLetterLink(
      new URL(import.meta.env.BASE_URL, location.href).href,
      { id: envelope.id, context: envelope.context },
    );
  } catch {
    return null;
  }
  return (
    <CopyField
      label="Public link for this letter"
      buttonLabel="Copy public letter link"
      copiedMessage="Public letter link copied. Anyone can read it and collect an available public gift once."
      multiline
      value={link}
    />
  );
}
