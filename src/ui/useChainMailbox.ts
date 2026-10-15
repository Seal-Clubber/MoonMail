import { FeeLimitError, type FeeProblem } from "../core/fee-limit";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { Deployment, Postbox } from "../core/types";
import type { ConnectedWallet } from "../core/wallet";
import type { PostOfficeClient } from "../core/chain";
import { SapientSession } from "../core/sapient";
import { mailboxStateReady } from "../core/config";
import { mailboxKey } from "../core/mailbox";
import {
  emptyPreferences,
  preferences,
  openPreferences,
  sealPreferences,
  statePayload,
  toggleMark,
  setMarks,
  toggleFavourite,
  type MailboxPreferences,
} from "../core/mailbox-state";
import { browserStorage } from "../core/browser-storage";
import { readPending, savePending } from "../core/pending";
import { readDelivery } from "../core/delivery";
export interface MailboxAccess {
  wallet?: ConnectedWallet;
  chain?: PostOfficeClient;
  deployment: Deployment;
  approved: boolean;
  writeBlocked: boolean;
  task: (fn: () => Promise<void>) => Promise<void>;
  onStatus: (message: string) => void;
}
// Private settings stay in memory across Inbox/Compose navigation, scoped to
// the verified wallet session and office. They are never plaintext disk storage.
type Snapshot = {
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  tried: boolean;
  error: string;
  saved?: MailboxPreferences;
  draft: MailboxPreferences;
  base?: { revision: string; ciphertext: string; component?: string };
  fee: string;
  feeProblem?: FeeProblem;
};
type Entry = { value: Snapshot; listeners: Set<() => void>; active: boolean };
const changes = new Set<() => void>();
const sessions = new WeakMap<SapientSession, Map<string, Entry>>();
function entry(wallet: unknown, scope: string): Entry {
  let entries =
    wallet instanceof SapientSession ? sessions.get(wallet) : undefined;
  if (wallet instanceof SapientSession && !entries) {
    entries = new Map();
    sessions.set(wallet, entries);
  }
  let result = entries?.get(scope);
  if (!result) {
    result = {
      value: {
        loaded: false,
        loading: false,
        saving: false,
        tried: false,
        error: "",
        draft: emptyPreferences(),
        fee: "100000",
      },
      listeners: new Set(),
      active: true,
    };
    entries?.set(scope, result);
  }
  return result;
}
export function clearMailboxSession(
  wallet: ConnectedWallet | undefined,
  deployment: Deployment,
) {
  if (!(wallet instanceof SapientSession)) return;
  const entries = sessions.get(wallet);
  for (const [scope, store] of entries || []) {
    const [network, registry, template] = JSON.parse(scope);
    if (
      network !== deployment.network ||
      registry !== deployment.registry ||
      template !== deployment.template
    )
      continue;
    store.active = false;
    store.value = {
      loaded: false,
      loading: false,
      saving: false,
      tried: false,
      error: "",
      draft: emptyPreferences(),
      fee: "100000",
    };
    entries!.delete(scope);
    store.listeners.forEach((listener) => listener());
  }
  changes.forEach((listener) => listener());
}
export function usePendingMailboxChanges(
  wallet: ConnectedWallet | undefined,
  deployment: Deployment,
) {
  const ids = useSyncExternalStore(
    useCallback((listener: () => void) => {
      changes.add(listener);
      return () => {
        changes.delete(listener);
      };
    }, []),
    () => {
      const entries =
        wallet instanceof SapientSession ? sessions.get(wallet) : undefined;
      return JSON.stringify(
        [...(entries?.entries() || [])]
          .filter(([scope, entry]) => {
            const [network, registry, template] = JSON.parse(scope);
            return (
              network === deployment.network &&
              registry === deployment.registry &&
              template === deployment.template &&
              entry.value.loaded &&
              JSON.stringify(entry.value.saved) !==
                JSON.stringify(entry.value.draft)
            );
          })
          .map(([scope]) => JSON.parse(scope)[3]),
      );
    },
  );
  const pending = JSON.parse(ids) as string[];
  useEffect(() => {
    if (!pending.length) return;
    const leaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", leaving);
    return () => window.removeEventListener("beforeunload", leaving);
  }, [ids]);
  return pending;
}
export function useChainMailbox(box: Postbox, access?: MailboxAccess) {
  const scope = JSON.stringify([
    access?.deployment.network,
    access?.deployment.registry,
    access?.deployment.template,
    box.id,
    box.controller,
  ]);
  const store = useMemo(
    () => entry(access?.wallet, scope),
    [access?.wallet, scope],
  );
  const state = useSyncExternalStore(
    useCallback(
      (listener: () => void) => {
        store.listeners.add(listener);
        return () => {
          store.listeners.delete(listener);
        };
      },
      [store],
    ),
    () => store.value,
  );
  const { loaded, saved, draft, base, fee } = state;
  function update(patch: Partial<Snapshot>) {
    if (!store.active) return;
    store.value = { ...store.value, ...patch };
    store.listeners.forEach((listener) => listener());
    changes.forEach((listener) => listener());
  }
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    return () => {
      generation.current++;
    };
  }, [store]);
  const ready =
    !!access?.chain &&
    mailboxStateReady(access.deployment) &&
    access.wallet instanceof SapientSession &&
    access.wallet.accounts[0].account.owner_public_key === box.controller;
  const dirty = loaded && JSON.stringify(saved) !== JSON.stringify(draft);
  function run(fn: () => Promise<void>) {
    if (access && !store.value.loading) void access.task(fn);
  }
  async function read(
    expectedGeneration: number,
    submitted?: MailboxPreferences,
  ) {
    if (
      !access?.approved ||
      !ready ||
      !access.chain ||
      !(access.wallet instanceof SapientSession)
    )
      throw new Error("Approve Sapient postbox view access first");
    const wallet = access.wallet;
    if (!(await wallet.hasPostboxViewAccess()))
      throw new Error(
        "Sapient private access was removed. Unlock private mail again.",
      );
    const latest = await access.chain.readMailbox(box);
    let value = emptyPreferences();
    if (latest.revision !== "0") {
      const payload = statePayload(latest.ciphertext),
        descriptor = mailboxKey({
          version: payload.version,
          keyVersion: payload.keyVersion,
          publicKey: payload.recipientKey,
          recovery: payload.recovery,
          capsule: payload.capsule,
        });
      const context = {
        ...access.deployment,
        postbox: box.id,
        controller: box.controller,
        keyVersion: payload.keyVersion,
      };
      const secret = await wallet
        .capsuleMailbox((id) => access.chain!.provider.getSubstate(id))
        .recover(
          wallet.accounts[0].account.component_address,
          context,
          descriptor,
        );
      try {
        value = await openPreferences(
          latest.ciphertext,
          context,
          latest.revision,
          secret,
        );
      } finally {
        secret.fill(0);
      }
      await wallet.assertCurrent();
    }
    await wallet.assertCurrent();
    update({
      base: latest,
      saved: value,
      loaded: true,
      draft:
        submitted && store.value.draft !== submitted
          ? store.value.draft
          : value,
    });
  }
  async function load() {
    if (store.value.loading) return;
    const g = generation.current;
    update({ loading: true, tried: true, error: "" });
    try {
      await read(g);
    } catch (error) {
      update({
        error:
          error instanceof Error
            ? error.message
            : "Could not load mailbox settings",
      });
    } finally {
      // Release the shared loading latch even if this view was closed.
      update({ loading: false });
    }
  }
  useEffect(() => {
    if (ready && access?.approved && !state.loaded && !state.tried) void load();
  }, [store, ready, access?.approved, state.loaded, state.tried]);
  function edit(fn: (value: MailboxPreferences) => MailboxPreferences) {
    if (!store.value.loaded || store.value.loading) return;
    try {
      update({ draft: fn(store.value.draft) });
    } catch (error) {
      access?.onStatus((error as Error).message);
    }
  }
  return {
    ready,
    loaded,
    dirty,
    draft,
    saved,
    fee,
    loading: state.loading || state.saving,
    error: state.error,
    feeProblem: state.feeProblem,
    setFee: (value: string) => update({ fee: value }),
    load: () => {
      void load();
    },
    reload: () => {
      if (!dirty) void load();
    },
    discard: () => {
      if (store.value.saved && !store.value.loading)
        update({ draft: store.value.saved, feeProblem: undefined });
    },
    toggle: (id: string, bit: number) => edit((p) => toggleMark(p, id, bit)),
    markMany: (ids: string[], bit: number, enabled: boolean) =>
      edit((p) => setMarks(p, ids, bit, enabled)),
    favourite: (id: string) => edit((p) => toggleFavourite(p, id)),
    change: (patch: Partial<Pick<MailboxPreferences, "sort" | "density">>) =>
      edit((p) => preferences({ ...p, ...patch })),
    save: () => {
      if (store.value.saving || store.value.loading) return;
      update({ saving: true });
      run(async () => {
        try {
          if (
            !ready ||
            !access?.approved ||
            access.writeBlocked ||
            !(access.wallet instanceof SapientSession) ||
            !access.chain ||
            !base ||
            !loaded ||
            !dirty
          )
            throw new Error("Load verified mailbox settings before saving");
          const submitted = store.value.draft;
          const g = generation.current,
            wallet = access.wallet,
            descriptor = mailboxKey(box.encryptionKey),
            context = {
              ...access.deployment,
              postbox: box.id,
              controller: box.controller,
              keyVersion: descriptor.keyVersion,
            };
          if (!(await wallet.hasPostboxViewAccess()))
            throw new Error(
              "Sapient private access was removed. Unlock private mail again.",
            );
          const ciphertext = await sealPreferences(
            submitted,
            context,
            (BigInt(base.revision) + 1n).toString(),
            descriptor,
          );
          await wallet.assertCurrent();
          if (g !== generation.current || !store.active)
            throw new Error("Wallet or post office changed before saving");
          const id = await access.chain.saveMailbox(
            wallet,
            wallet.accounts[0],
            box,
            base,
            ciphertext,
            fee,
            browserStorage,
          );
          const pending = readPending(browserStorage).find((p) => p.id === id);
          if (!pending)
            throw new Error("Keep the original mailbox submission in Activity");
          const result = await readDelivery(access.chain, pending);
          savePending(browserStorage, result);
          if (result.state !== "confirmed")
            throw new Error(
              "Mailbox save awaits its original receipt. Check Activity; do not send a replacement.",
            );
          if (g !== generation.current) return;
          await read(g, submitted);
          update({ feeProblem: undefined });
          access.onStatus(
            "Mailbox settings confirmed on Ootle. The same wallet can recover them on another device.",
          );
        } catch (error) {
          update({
            feeProblem:
              error instanceof FeeLimitError ? error.problem : undefined,
          });
          throw error;
        } finally {
          update({ saving: false });
        }
      });
    },
  };
}
