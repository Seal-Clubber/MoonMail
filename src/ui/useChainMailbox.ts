import { useEffect, useRef, useState } from "react";
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
export function useChainMailbox(box: Postbox, access?: MailboxAccess) {
  const [loaded, setLoaded] = useState(false),
    [saved, setSaved] = useState<MailboxPreferences>(),
    [draft, setDraft] = useState(emptyPreferences),
    [base, setBase] = useState<{
      revision: string;
      ciphertext: string;
      component?: string;
    }>(),
    [fee, setFee] = useState("100000");
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setLoaded(false);
    setSaved(undefined);
    setDraft(emptyPreferences());
    setBase(undefined);
    return () => {
      generation.current++;
    };
  }, [
    access?.wallet,
    access?.chain,
    access?.deployment.registry,
    access?.deployment.template,
    box.id,
    box.controller,
  ]);
  const ready =
    !!access &&
    mailboxStateReady(access.deployment) &&
    access.wallet instanceof SapientSession &&
    access.wallet.accounts[0].account.owner_public_key === box.controller;
  const dirty = loaded && JSON.stringify(saved) !== JSON.stringify(draft);
  function run(fn: () => Promise<void>) {
    if (access) void access.task(fn);
  }
  async function read(expectedGeneration: number) {
    if (
      !access?.approved ||
      !ready ||
      !access.chain ||
      !(access.wallet instanceof SapientSession)
    )
      throw new Error("Approve Sapient postbox view access first");
    const wallet = access.wallet,
      latest = await access.chain.readMailbox(box);
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
    if (generation.current !== expectedGeneration) return;
    setBase(latest);
    setSaved(value);
    setDraft(value);
    setLoaded(true);
  }
  return {
    ready,
    loaded,
    dirty,
    draft,
    fee,
    setFee,
    load: () =>
      run(async () => {
        const g = generation.current;
        await read(g);
        if (g === generation.current)
          access!.onStatus(
            "Mailbox settings loaded from Ootle. Reading sent no transaction.",
          );
      }),
    reload: () =>
      run(async () => {
        if (dirty) throw new Error("Discard unsaved changes before reloading");
        await read(generation.current);
      }),
    discard: () => {
      if (saved) setDraft(saved);
    },
    toggle: (id: string, bit: number) => {
      if (loaded) {
        try {
          setDraft(toggleMark(draft, id, bit));
        } catch (error) {
          access?.onStatus((error as Error).message);
        }
      }
    },
    change: (patch: Partial<Pick<MailboxPreferences, "sort" | "density">>) => {
      if (loaded) setDraft((p) => preferences({ ...p, ...patch }));
    },
    save: () =>
      run(async () => {
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
        const g = generation.current,
          wallet = access.wallet,
          descriptor = mailboxKey(box.encryptionKey),
          context = {
            ...access.deployment,
            postbox: box.id,
            controller: box.controller,
            keyVersion: descriptor.keyVersion,
          };
        const ciphertext = await sealPreferences(
          draft,
          context,
          (BigInt(base.revision) + 1n).toString(),
          descriptor,
        );
        await wallet.assertCurrent();
        if (g !== generation.current)
          throw new Error("Wallet changed before saving");
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
        await read(g);
        access.onStatus(
          "Mailbox settings confirmed on Ootle. The same wallet can recover them on another device.",
        );
      }),
  };
}
