import { useEffect, useRef, useState } from "react";
import { GhostMark } from "./GhostMark";
import { ActivityBook } from "./ActivityBook";
import {
  sampleMail,
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
import {
  sealLetter,
  openLetter,
  assertEnvelopeSize,
  ENVELOPE_LIMIT,
} from "../core/crypto";
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
import { Postboxes } from "./Postboxes";
import { AmountInput, tari } from "./AmountInput";
import { CopyField } from "./CopyField";
import { WalletFunds } from "./WalletFunds";
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

const short = (v: string) =>
  v.length > 20 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v;
export function App() {
  const [officeLoadError, setOfficeLoadError] = useState(false);
  const hallRange = useRef<HTMLParagraphElement>(null);
  const deploymentRevision = useRef(0);
  const initialOfficePending = useRef(true);
  const [view, setView] = useState("hall"),
    [d, setD] = useState<Deployment>(() => networkPreset(38)),
    [chain, setChain] = useState<PostOfficeClient>();
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
  const [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [taskBusy, setBusy] = useState(false),
    [active, setActive] = useState<Envelope>(),
    [plain, setPlain] = useState<Letter>(),
    [ghost, setGhost] = useState(false);
  const activeSample = !!active && sampleMail.includes(active);
  const [showSampleActivity, setShowSampleActivity] = useState(false);
  const [mode, setMode] = useState<MailMode>("link"),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [gift, setGift] = useState("0"),
    [reserve, setReserve] = useState("0"),
    [fee, setFee] = useState("100000"),
    [reply, setReply] = useState(""),
    [recipient, setRecipient] = useState(""),
    [directoryQuery, setDirectoryQuery] = useState("");
  const [mailQuery, setMailQuery] = useState(""),
    [mailFilter, setMailFilter] = useState<SampleMailFilter>("all");
  const [review, setReview] = useState(false),
    [prepared, setPrepared] = useState<{
      envelope: Envelope;
      capability?: string;
    }>(),
    [privateLink, setPrivateLink] = useState(""),
    [linkSaved, setLinkSaved] = useState(false),
    [, setDeliveryRevision] = useState(0),
    [autoChecking, setAutoChecking] = useState(false);
  const [address, setAddress] = useState(""),
    [destination, setDestination] = useState(""),
    [createAccount, setCreateAccount] = useState(false),
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
          const initialView = hash.slice(2);
          if (
            [
              "hall",
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
    window.addEventListener("hashchange", readHash);
    window.addEventListener("popstate", readHash);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", readHash);
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
          setLetters(data.letters);
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
    if (view !== "activity" || !chain || busy || writeBlocked) {
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
              if (next.operation === "publish") shareConfirmed(next.envelopeId);
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
    setCreateAccount(false);
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
    if (plain && active?.mode === "postbox" && !connect)
      document.getElementById("letter-title")?.focus({ preventScroll: true });
  }, [plain, active?.id, active?.mode, connect]);
  useEffect(
    () => () => {
      secret.current?.fill(0);
    },
    [],
  );
  useEffect(() => {
    if (!connect && !active) {
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
  }, [connect, active?.id]);
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
  function navigate(v: string) {
    setPublicLetterRoute(undefined);
    setPublicLetterState("idle");
    setPostboxInvitation(undefined);
    setView(v);
    if (v !== "hall") {
      setPreview(false);
      setMailFilter("all");
    }
    setError("");
    setReview(false);
    history.pushState(null, "", `${location.pathname}#/${v}`);
    window.scrollTo(0, 0);
  }
  function beginAddressedDraft(id: string, replyTitle?: string) {
    const postbox = boxes.find((p) => p.id === id);
    if (!postbox) return;
    const keptDraft = !!(subject || body || (gift && gift !== "0"));
    focusAddressedDraft.current = true;
    draftSequence.current += 1;
    closeLetter();
    setMode("postbox");
    setRecipient(id);
    if (replyTitle && !subject.trim())
      setSubject(`Re: ${replyTitle}`.slice(0, 120));
    setPrepared(undefined);
    setLinkSaved(false);
    navigate("compose");
    setStatus(
      `Writing to ${postbox.nickname}. ${keptDraft ? "Your existing draft is kept. " : ""}Review the recipient and gift before publishing.`,
    );
  }
  function shareConfirmed(id: string) {
    if (prepared?.envelope.id !== id || !prepared.capability) return;
    setPrivateLink(
      createGiftLink(new URL(import.meta.env.BASE_URL, location.href).href, {
        id,
        capability: prepared.capability,
        context: d,
      }),
    );
  }
  function closeLetter() {
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
    setCreateAccount(false);
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
    setLetters(data.letters);
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
  const hallLetters = preview
    ? sampleMail
    : letters.filter((e) => e.mode !== "postbox");
  const shown = preview
    ? filterSampleMail(mailFilter, mailQuery)
    : filterHallMail(
        hallLetters,
        mailFilter === "postbox" ? "all" : mailFilter,
        mailQuery,
      );
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(shown.length / 12)));
  const current = wallet?.accounts[account];
  const draftPostbox =
    mode === "postbox" ? boxes.find((p) => p.id === recipient) : undefined;
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
  let draftSize: number | undefined;
  try {
    if (mode !== "postbox" || draftPostbox)
      draftSize = draftEnvelopeSize(
        { subject, body },
        { ...draftMetadata, id: "0".repeat(36) },
        draftPostbox ? mailboxKey(draftPostbox.encryptionKey) : undefined,
      );
  } catch {
    /* Invalid postbox keys stay blocked by the existing preparation checks. */
  }
  const draftTooLarge = draftSize !== undefined && draftSize > ENVELOPE_LIMIT;

  function clearWallet(revoke: boolean) {
    connectionSequence.current += 1;
    draftSequence.current += 1;
    openSequence.current += 1;
    if (revoke) wallet?.disconnect();
    setWallet(undefined);
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
      ...draftMetadata,
      id,
      payload: addressed || sealed?.payload || { subject, body },
    };
    assertEnvelopeSize(envelope);
    if (draftSequence.current !== sequence) return;
    setLinkSaved(false);
    setPrepared({ envelope, capability: sealed?.capability });
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
        if (p.operation === "postbox" || p.operation === "capsule") {
          setStatus(
            "This wallet submission has no transaction ID. Inspect the controlling wallet's transaction history before resolving it; matching postbox state alone cannot identify the submitted transaction. Retrying remains blocked.",
          );
          return;
        }
        const e = await chain.readLetter(p.envelopeId);
        if (p.operation === "publish") {
          savePending(browserStorage, {
            ...p,
            state: "confirmed",
          });
          await refresh();
          if (p.operation === "publish") shareConfirmed(p.envelopeId);
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
        shareConfirmed(p.envelopeId);
    });
  }
  async function resumeActivity(p: Pending) {
    await task(async () => {
      if (!(wallet instanceof SapientSession)) return;
      const id = await wallet.resume(p.id, browserStorage);
      setStatus(`Sapient submission ${id}. Reconcile chain confirmation next.`);
    });
  }
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
    <div className="app-shell">
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
          href="#/hall"
          onClick={(e) => {
            e.preventDefault();
            navigate("hall");
          }}
        >
          <span className="brand-icon" aria-hidden="true">
            <GhostMark />
          </span>
          <span>
            GHOSTDROP<small>THE HAUNTED POST OFFICE</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {[
            ["hall", "Public mail"],
            ["compose", "Write a letter"],
            ["postboxes", "My inbox"],
            ["activity", "Activity"],
          ].map(([v, label]) => (
            <button
              key={v}
              className={view === v ? "nav-active" : ""}
              aria-current={view === v ? "page" : undefined}
              onClick={() => navigate(v)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="wallet-actions">
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
      </header>
      <main id="main-content" tabIndex={-1}>
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
        {postboxInvitation && (
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
        )}
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
        <div className="eyebrow">
          <span /> SAPIENT ·{" "}
          {d.network === 16
            ? "LOCALNET"
            : d.network === 38
              ? "ESMERALDA"
              : "IGOR"}{" "}
          TESTNET · TEST TARI ONLY <span />
        </div>
        {view === "hall" && (
          <>
            <section className="hero">
              <div className="hero-sigil" aria-hidden="true">
                <GhostMark />
              </div>
              <p className="kicker">SOME THINGS ARE BETTER LEFT UNSEALED.</p>
              <h1>
                A little mystery.
                <br />A little <em>generosity.</em>
              </h1>
              <p>
                Letters from strangers. Gifts from ghosts.
                <br />A little kindness, delivered through Sapient.
              </p>
              <div className="hero-actions">
                <button className="primary" onClick={() => navigate("compose")}>
                  Leave a little kindness <span>↗</span>
                </button>
                <button onClick={() => navigate("postboxes")}>
                  Open my inbox <span>✉</span>
                </button>
              </div>
              <div className="hero-rule">
                <span /> READ WITHOUT A WALLET · SEND WITH SAPIENT <span />
              </div>
            </section>
            <section
              className={`hall ${list ? "list-hall" : ""}`}
              aria-label="Floating mail hall"
            >
              <div className="hall-heading">
                <div>
                  <span className="kicker">PUBLIC MAIL</span>
                  <h2>Letters left for anyone.</h2>
                </div>
                <div className="hall-tools">
                  {d.registry && (
                    <button onClick={togglePreview}>
                      {preview ? "Leave preview" : "Try sample mail"}
                    </button>
                  )}
                  <button aria-pressed={list} onClick={() => setList(!list)}>
                    {list ? "✧ Scene view" : "☷ List view"}
                  </button>
                  <button
                    onClick={() => void task(refresh)}
                    disabled={preview || !d.registry || !d.indexerUrl || busy}
                  >
                    ↻ Refresh
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
                    Browse {sampleMail.length} examples, including private
                    invitations and postbox mail. Every sample can be read here;
                    real sealed mail requires its link or controlling wallet.
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
                    <div>
                      <label htmlFor="hall-mail-filter">Show mail</label>
                      <select
                        id="hall-mail-filter"
                        value={mailFilter}
                        onChange={(event) => {
                          setMailFilter(event.target.value as SampleMailFilter);
                          setPage(1);
                        }}
                      >
                        <option value="all">
                          {preview ? "All sample mail" : "All hall mail"}
                        </option>
                        <option value="public">Public letters</option>
                        <option value="link">Sealed invitations</option>
                        <option value="gifts">Uncollected public gifts</option>
                        {preview && (
                          <option value="postbox">Sample postbox mail</option>
                        )}
                      </select>
                    </div>
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
                <div className="scene-moon" />
                <div className="scene-stars" aria-hidden="true">
                  ✧ · ✦ · ✧
                </div>
                <div className="ghost-clerk" aria-hidden="true">
                  <span className="ghost-eyes" />
                </div>
                <div className="clerk-tag">
                  <span>YOUR SPECTRAL CLERK</span>
                  <small>“Kindness travels further than you think.”</small>
                </div>
                <div className="envelope-grid">
                  {shown
                    .slice((visiblePage - 1) * 12, visiblePage * 12)
                    .map((e, i) => (
                      <button
                        className={`envelope-card envelope-${i % 3} ${e.mode !== "public" ? "sealed" : ""}`}
                        key={e.id}
                        onClick={() => {
                          setCreateAccount(false);
                          setActive(e);
                          setPlain(
                            preview
                              ? sampleLetter(e.id)
                              : e.mode === "public"
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
                              : e.mode === "postbox"
                                ? "SAMPLE POSTBOX MAIL"
                                : "PRIVATE INVITATION"}
                          </span>
                          <h3>
                            {preview
                              ? sampleLetter(e.id)!.subject
                              : e.mode === "public"
                                ? (e.payload as Letter).subject
                                : "A sealed little secret"}
                          </h3>
                          <p>
                            {e.mode === "public"
                              ? "Anyone may read"
                              : e.mode === "postbox"
                                ? "Fictional addressed example"
                                : "Requires its private link"}
                          </p>
                          {list && (
                            <p className="letter-excerpt">
                              {preview
                                ? sampleLetter(e.id)!
                                    .body.replace(/\s+/g, " ")
                                    .slice(0, 150)
                                : e.mode === "public"
                                  ? (e.payload as Letter).body
                                      .replace(/\s+/g, " ")
                                      .slice(0, 150)
                                  : "Sealed contents stay private. Open with the sender’s complete private link."}
                            </p>
                          )}
                          {BigInt(e.gift) > 0n && (
                            <small>
                              {preview
                                ? e.claimed
                                  ? "Sample gift · collected"
                                  : `${tari(e.gift)} sample TARI gift`
                                : e.claimed
                                  ? "Collected"
                                  : e.mode === "public"
                                    ? `${tari(e.gift)} TARI gift`
                                    : "Gift availability recorded on chain"}
                            </small>
                          )}
                        </div>
                        {list && (
                          <>
                            <div className="mail-row-meta">
                              <span
                                className={`mail-audience audience-${e.mode}`}
                              >
                                {e.mode === "public"
                                  ? "Public letter"
                                  : e.mode === "link"
                                    ? "Private link"
                                    : "Postbox mail"}
                              </span>
                              <span className="mail-row-reference">
                                {preview ? "Sample" : "Letter"} {short(e.id)}
                              </span>
                              {BigInt(e.gift) === 0n && (
                                <span className="mail-row-no-gift">
                                  Letter only
                                </span>
                              )}
                            </div>
                            <span className="mail-row-open" aria-hidden="true">
                              ↗
                            </span>
                          </>
                        )}
                      </button>
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
                          ? "Try another word or show all hall mail. Sealed contents stay private."
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
                <span>✧ Public letters</span>
                <span>⌘ Sealed invitations</span>
                <span>
                  ▥{" "}
                  {preview
                    ? "Sample postbox mail"
                    : "Personal postboxes live in My inbox"}
                </span>
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
          <section className="page-panel compose">
            <span className="kicker">THE WRITING DESK</span>
            <h1 id="writing-desk-title" tabIndex={-1}>
              Send something <em>unexpected.</em>
            </h1>
            <p>Choose who can open it. A few words can make someone’s night.</p>
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
                Only people with your complete link can open this letter. Anyone
                holding it can collect the gift once, including you. Save the
                link before sending; lost links cannot be recovered.
              </p>
            )}
            {mode === "postbox" && (
              <p className="info">
                A private letter for a Sapient postbox.{" "}
                {writesReady(d, "postbox", "sapient")
                  ? "Only its owner can open it or collect its gift. Choose a friend below, or paste their postbox ID."
                  : "Private postbox sending is currently unavailable. Check the post office connection in Settings."}
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
              <label className="letter-body-label" htmlFor="letter-body">
                Your letter
              </label>
              <textarea
                id="letter-body"
                value={body}
                disabled={busy}
                maxLength={2600}
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
                          : `${Math.max(0, Math.floor((1 - draftSize / ENVELOPE_LIMIT) * 100))}% remaining`}
                      </strong>
                    </div>
                    <progress
                      aria-label="Letter space used"
                      aria-valuetext={`${Math.min(100, Math.ceil((draftSize / ENVELOPE_LIMIT) * 100))}% used`}
                      max={ENVELOPE_LIMIT}
                      value={Math.min(draftSize, ENVELOPE_LIMIT)}
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
                    Choose a registered postbox to check available letter space.
                  </p>
                )}
              </div>
              {mode === "postbox" && (
                <div className="recipient-choice">
                  <label htmlFor="recipient-postbox">Recipient postbox</label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => navigate("ledger")}
                  >
                    Browse the spirit directory ↗
                  </button>
                  <select
                    id="recipient-postbox"
                    value={recipient}
                    disabled={busy}
                    onChange={(e) => {
                      setRecipient(e.target.value);
                      setReview(false);
                    }}
                  >
                    <option value="">Choose a registered postbox</option>
                    {boxes
                      .filter((p) => p.discoverable || p.id === recipient)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nickname}
                          {!p.discoverable ? " · Unlisted" : ""} · {short(p.id)}
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
                </div>
              )}
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
                  <AmountInput
                    label="Set aside for collection fees"
                    value={reserve}
                    disabled={busy}
                    onChange={(value) => {
                      setReserve(value);
                      setReview(false);
                    }}
                  />
                )}
              </div>
              <p className="fine-print">
                The recipient gets the full gift. You fund collection fees
                separately. Gifts have no expiry or refunds; unused collection
                funds stay locked. Use 0 for a letter without a gift.
              </p>
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
              {reply && (
                <label>
                  Verified owned reply postbox
                  <select
                    value={reply}
                    disabled={busy}
                    onChange={(e) => {
                      setReply(e.target.value);
                      setReview(false);
                    }}
                  >
                    {owned.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nickname} · {short(p.id)}
                      </option>
                    ))}
                  </select>
                </label>
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
                        {a.account.name} · {short(a.account.component_address)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <details className="advanced">
                <summary>Sending fee limit</summary>
                <AmountInput
                  label="Maximum sending fee per attempt"
                  value={fee}
                  disabled={busy}
                  onChange={(value) => {
                    setFee(value);
                    setReview(false);
                  }}
                />
                <p className="fine-print">
                  Sapient estimates the fee before you approve. Your letter and
                  its encrypted wrapping must fit within 4 KiB.
                </p>
              </details>
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
                </dl>
                {prepared.envelope.replyPostbox && (
                  <p className="fine-print">
                    Your included reply postbox ID is public, including on
                    sealed letters.
                  </p>
                )}
                <p>
                  Sapient will show the sending fee before you approve.
                  Collection works only if the funds you set aside cover it.
                </p>
                <p className="fine-print">
                  Nothing has been published or funded yet. Encryption includes
                  the subject. Private gift amounts and routing metadata remain
                  visible on chain.
                </p>
                {prepared.capability && d.registry && (
                  <section
                    className="secret-link-save"
                    aria-labelledby="save-link-title"
                  >
                    <h3 id="save-link-title">Keep your secret safe.</h3>
                    <p>
                      Save this complete link before sending. It opens after
                      delivery confirms. Anyone with it can open the letter and
                      collect its gift; GhostDrop cannot recover it for you.
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
                <button
                  className="primary"
                  disabled={
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
                      const id = await chain.publish(
                        wallet,
                        current,
                        prepared.envelope,
                        fee,
                        browserStorage,
                      );
                      navigate("activity");
                      setStatus(
                        `Letter submitted. Check its confirmation below before sharing. Transaction: ${id}.`,
                      );
                    })
                  }
                >
                  Fund & publish letter
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
            onActivity={() => navigate("activity")}
            writeBlocked={writeBlocked}
            onOpen={(e) => void task(() => openPostbox(e))}
            onRefresh={refresh}
            onMore={loadMore}
            unavailableLetterIds={unavailableLetterIds}
            loadingMore={loadingMore}
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
              Find a friend’s listed postbox. Check the ID with your friend:
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
                .filter(
                  (p) =>
                    p.discoverable &&
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
            {!boxes.some(
              (p) =>
                p.discoverable &&
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
                    : "Friends can share an unlisted postbox ID directly. You can also create your own."}
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
              wallet. No GhostDrop server.
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
                  Public network settings are ready to check. GhostDrop still
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
                The indexer supplies public mail data. GhostDrop checks contract
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
                  setCreateAccount(false);
                }}
                onInbox={() => navigate("postboxes")}
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
        <button onClick={() => navigate("network")}>Settings ↗</button>
        <span className="footer-note">ESMERALDA TESTNET · SAPIENT</span>
      </footer>
      {connect && (
        <div className="modal-backdrop">
          <section
            className="modal"
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
            <span className="kicker">YOUR SAPIENT WALLET</span>
            <h2 id="wallet-title">
              {wallet && current ? "Your Sapient wallet" : "Connect Sapient"}
            </h2>
            {wallet && current ? (
              <div className="wallet-summary">
                <p>
                  Connected on {d.network === 38 ? "Esmeralda" : "Igor"}{" "}
                  testnet. Use this address to receive test TARI, or select this
                  account when collecting a gift.
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
              <>
                <p>
                  Unlock Sapient, choose Esmeralda, then approve this site’s
                  connection. Your wallet keeps your keys and asks before every
                  transaction.
                </p>
                <details>
                  <summary>What do I need?</summary>
                  <p className="fine-print">
                    Sapient is the wallet itself. Open GhostDrop in the browser
                    where you use Sapient, unlock it, and choose your Ootle
                    account. There is no separate GhostDrop bridge or background
                    program.
                  </p>
                  <p className="fine-print">
                    Public mail and private links open without a wallet. Sending
                    needs public test TARI for fees and gift funding. If your
                    TARI is private, use Unshield in Sapient first. Your postbox
                    needs a separate privacy permission, which GhostDrop
                    explains before asking.
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
                    network, reconnect here. Disconnect clears private page
                    state.
                  </p>
                  <button className="primary" disabled={busy}>
                    {busy ? "Connecting…" : "Connect Sapient"}
                  </button>
                </form>
              </>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
      {active && !connect && (
        <div className="modal-backdrop">
          <section
            className="modal letter-modal"
            role="dialog"
            aria-modal="true"
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
                  : "SEALED INVITATION"}
            </span>
            <h2 id="letter-title" tabIndex={-1}>
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
                {active.mode === "postbox" &&
                  wallet?.accounts.some(
                    (account) =>
                      account.account.owner_public_key ===
                      active.claimAuthority,
                  ) && (
                    <>
                      <button
                        ref={inboxFocus.ref}
                        aria-describedby={error ? "letter-error" : undefined}
                        disabled={busy || !chain}
                        onClick={() =>
                          void task(() => {
                            const opening = openPostbox(active);
                            inboxFocus.remember();
                            return opening;
                          })
                        }
                      >
                        {busy ? "Opening your letter…" : "Retry opening letter"}
                      </button>
                      <p className="fine-print">
                        If Sapient needs view permission, close this letter and
                        approve postbox view access in My inbox first.
                      </p>
                    </>
                  )}
              </div>
            )}
            {active.replyPostbox &&
              boxes.some((p) => p.id === active.replyPostbox) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    beginAddressedDraft(
                      active.replyPostbox!,
                      plain?.subject || "Your letter",
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
                  {activeSample ? "Example payload" : "Stored chain payload"}
                </h3>
                <pre>{JSON.stringify(active.payload, null, 2)}</pre>
                <p>
                  Encryption hides the subject and body of sealed mail. This
                  implementation uses revealed test TARI: amounts,
                  sender/controller keys, timing and routing remain observable.
                  Ghost View does not provide payment anonymity.
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
                    This gift has already been collected. You can still read the
                    letter.
                  </p>
                )}
                {collectionPending && !busy && (
                  <div role="status" className="info">
                    <p>Your collection is awaiting confirmation.</p>
                    <p className="fine-print">
                      A collected gift alone cannot confirm which account
                      received it. Check the original transaction in Activity
                      and your receiving account’s history before trying again.
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
                          Have Sapient? Connect to choose your receiving account
                          automatically. You can also collect using a compatible
                          address below.
                        </p>
                        <button
                          disabled={busy || !!claimReview}
                          onClick={() => setConnect(true)}
                        >
                          Connect Sapient to receive
                        </button>
                      </div>
                    )}
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
                    {destMode === "wallet" &&
                      wallet &&
                      wallet.accounts.length > 1 && (
                        <label>
                          Receiving account
                          <select
                            disabled={busy || !!claimReview}
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
                    {destMode === "wallet" && wallet?.accounts.length === 1 && (
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
                        {active.mode !== "postbox" && (
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={createAccount}
                              disabled={
                                busy || !!claimReview || !claimsReady(d, true)
                              }
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
                              disabled={busy || !!claimReview}
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
                        ? `Sapient will ask you to approve a proof for this gift and destination. GhostDrop then submits the claim. You receive ${tari(active.gift)} TARI; collection fees come from the funded reserve of up to ${tari(active.reserve)} TARI. Your wallet needs no coins for this claim. The approval expires after at most 10 network epochs.`
                        : active.mode === "postbox" &&
                            wallet?.kind === "sapient"
                          ? "Postbox collection is not enabled for this deployment. Your connected wallet must control this postbox."
                          : createAccount
                            ? "Use an Ootle address whose built-in account does not exist yet. The gift reserve pays account creation and collection fees; your receiving keys stay in your wallet."
                            : "Guests may use an existing compatible account without connecting its wallet. L1 XTM addresses, raw keys and arbitrary components are unsupported."}
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
                          (!createAccount && !destination) ||
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
                            const sequence = openSequence.current;
                            const reviewed = {
                              address: address.trim(),
                              destination: destination.trim(),
                              createAccount,
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
                                if (sequence !== openSequence.current) return;
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
                              if (!latest.claimed) setClaimReview(reviewed);
                            } finally {
                              setCheckingGift(false);
                            }
                          })
                        }
                      >
                        {checkingGift
                          ? "Checking gift…"
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
                          <dt>Receiving account</dt>
                          <dd>
                            {claimReview.createAccount ? (
                              "Create a new built-in account for this address"
                            ) : (
                              <code>{claimReview.destination}</code>
                            )}
                          </dd>
                        </dl>
                        <p className="fine-print">
                          {active.mode === "postbox"
                            ? "Confirming asks Sapient to approve a proof for this gift and destination. Only then can GhostDrop submit the collection."
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
                              busy || writeBlocked || !chain || active.claimed
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
                                  active.mode === "postbox" && wallet && owner
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
                            {busy ? "Collecting…" : "Confirm & collect gift"}
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
      )}
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
