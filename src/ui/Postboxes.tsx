import { useState, useEffect } from "react";
import type { Deployment, Envelope, Postbox } from "../core/types";
import type { ConnectedWallet } from "../core/wallet";
import type { PostOfficeClient } from "../core/chain";
import { mailboxKey } from "../core/mailbox";
import { writesReady } from "../core/config";
import { readPending, savePending, type Pending } from "../core/pending";
import { SapientSession } from "../core/sapient";
import { AmountInput, tari } from "./AmountInput";
import { readDelivery } from "../core/delivery";
import { browserStorage } from "../core/browser-storage";
import { CopyField } from "./CopyField";
import { MailReadNotice } from "./MailReadNotice";
import { postboxNameError, POSTBOX_NAME_LIMIT } from "../core/postbox-name";
import { MailboxWorkspace } from "./MailboxWorkspace";
import type { Letter } from "../core/types";
import { createPostboxLink } from "../core/postbox-links";

export function Postboxes({
  wallet,
  chain,
  deployment,
  boxes,
  letters,
  busy,
  task,
  onStatus,
  onConnect,
  onActivity,
  onOpen,
  onClose,
  onCompose,
  onRead,
  plain,
  activeId,
  onReaderTarget,
  onRefresh,
  onMore,
  unavailableLetterIds,
  loadingMore,
  hasMore,
  writeBlocked,
}: {
  wallet?: ConnectedWallet;
  chain?: PostOfficeClient;
  deployment: Deployment;
  boxes: Postbox[];
  letters: Envelope[];
  busy: boolean;
  task: (fn: () => Promise<void>) => Promise<void>;
  onStatus: (text: string) => void;
  onConnect: () => void;
  onActivity: () => void;
  onOpen: (letter: Envelope) => void;
  onClose: () => void;
  onCompose: (box: Postbox) => void;
  onRead: (letter: Envelope) => Promise<Letter>;
  plain: ReadonlyMap<string, Letter>;
  activeId?: string;
  onReaderTarget: (target: HTMLDivElement | null) => void;
  onRefresh: () => Promise<void>;
  onMore: () => Promise<void>;
  hasMore: boolean;
  loadingMore: boolean;
  unavailableLetterIds: string[];
  writeBlocked: boolean;
}) {
  const [selected, setSelected] = useState(""),
    [controller, setController] = useState(0),
    [nickname, setNickname] = useState(""),
    [discoverable, setDiscoverable] = useState(true),
    [fee, setFee] = useState("100000"),
    [recoveryFee, setRecoveryFee] = useState("1000000"),
    [editing, setEditing] = useState(false),
    [draftId, setDraftId] = useState<string>(() => crypto.randomUUID()),
    [rotating, setRotating] = useState(false),
    [prepared, setPrepared] = useState<Pending>(),
    [viewAcknowledged, setViewAcknowledged] = useState(false),
    [viewApproved, setViewApproved] = useState(false);

  const nameError = postboxNameError(nickname);
  const owned = boxes.filter((p) =>
    wallet?.accounts.some((a) => a.account.owner_public_key === p.controller),
  );
  const box = owned.find((p) => p.id === selected),
    account = box
      ? wallet?.accounts.find(
          (a) => a.account.owner_public_key === box.controller,
        )
      : wallet?.accounts[controller];
  useEffect(() => {
    setViewAcknowledged(false);
    setViewApproved(false);
  }, [wallet, account?.account.component_address]);
  useEffect(() => {
    if (!editing && !owned.some((p) => p.id === selected) && owned.length)
      choose(owned[0].id);
  }, [owned.map((p) => p.id).join(","), editing]);
  let invitationLink = "";
  if (box) {
    try {
      invitationLink = createPostboxLink(
        new URL(import.meta.env.BASE_URL, location.href).href,
        { id: box.id, context: deployment },
      );
    } catch {
      /* An unusual historical ID can still be shared manually. */
    }
  }
  const inbox = letters.filter(
    (e) => e.mode === "postbox" && e.recipientPostbox === box?.id,
  );
  const enabled =
    !!wallet &&
    !!chain &&
    writesReady(deployment, "postbox", "sapient") &&
    !busy &&
    !writeBlocked;
  useEffect(() => {
    if (
      !chain ||
      !prepared ||
      !/^[a-f0-9]{64}$/.test(prepared.id) ||
      prepared.state !== "submitted" ||
      busy
    )
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const pending = prepared;
    const until = Date.now() + 120_000;
    async function check() {
      if (cancelled || Date.now() >= until) return;
      if (!document.hidden)
        try {
          const next = await readDelivery(chain!, pending);
          if (cancelled) return;
          const latest = readPending(browserStorage).find(
            (p) => p.id === pending.id,
          );
          if (latest?.state === pending.state && next.state !== pending.state) {
            savePending(browserStorage, next);
            setPrepared((current) =>
              current?.id === pending.id ? next : current,
            );
            return;
          }
        } catch {
          /* Keep an uncertain backup and allow a manual status check. */
        }
      if (!cancelled) timer = setTimeout(check, 6_000);
    }
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chain, prepared?.id, prepared?.state, wallet, deployment.registry, busy]);
  const recoverySetups = readPending(browserStorage).filter((p) => {
    const c = p.capsule;
    if (
      p.operation !== "capsule" ||
      !c ||
      p.network !== deployment.network ||
      p.registry !== deployment.registry ||
      c.context.template !== deployment.template ||
      !wallet?.accounts.some(
        (a) =>
          a.account.component_address === c.account &&
          a.account.owner_public_key === c.context.controller,
      )
    )
      return false;
    const published = owned.find((b) => b.id === c.context.postbox);
    return (
      !published ||
      mailboxKey(published.encryptionKey).keyVersion < c.context.keyVersion
    );
  });
  function choose(id: string) {
    onClose();
    setSelected(id);
    const p = owned.find((p) => p.id === id);
    setNickname(p?.nickname || "");
    setDiscoverable(p?.discoverable ?? true);
    setEditing(false);
    setRotating(false);
    setPrepared(undefined);
    setDraftId(crypto.randomUUID());
  }
  function resume(p: Pending) {
    const c = p.capsule!;
    const existing = owned.find((b) => b.id === c.context.postbox);
    choose(existing?.id || "");
    setController(
      wallet!.accounts.findIndex(
        (a) => a.account.component_address === c.account,
      ),
    );
    setDraftId(c.context.postbox);
    setRotating(!!existing);
    setPrepared(p);
    setEditing(true);
  }
  async function confirmRecovery() {
    if (
      !chain ||
      !prepared ||
      (prepared.id.startsWith("attempt:") && !prepared.walletRequest)
    )
      throw new Error(
        "Inspect wallet history to resolve this recovery attempt; do not resubmit",
      );
    let current = prepared;
    if (prepared.id.startsWith("attempt:") && prepared.walletRequest) {
      if (!(wallet instanceof SapientSession))
        throw new Error("Reconnect the same Sapient account");
      const id = await wallet.resume(prepared.id, browserStorage);
      current = readPending(browserStorage).find((p) => p.id === id)!;
      if (!current)
        throw new Error("Recovery journal missing; reconcile wallet history");
    }
    const next = await readDelivery(chain, current);
    savePending(browserStorage, next);
    setPrepared(next);
    onStatus(
      next.state === "confirmed"
        ? rotating
          ? "Recovery backup confirmed. Approve updating your encryption key when you’re ready."
          : "Recovery backup confirmed. Approve opening your postbox when you’re ready."
        : "Backup is not confirmed yet. Keep this setup and check its original transaction in Sapient.",
    );
  }
  async function save(operation: "create" | "edit" | "rotate") {
    if (nameError) throw new Error(nameError);
    if (!wallet || !chain || !account)
      throw new Error("Connect the controlling wallet");
    if (!enabled)
      throw new Error("Postbox writes await deployment and recovery evidence");
    const id = box?.id || draftId;
    let encryptionKey = box?.encryptionKey || "";
    if (operation !== "edit") {
      const keyVersion =
        operation === "rotate" ? mailboxKey(encryptionKey).keyVersion + 1 : 1;
      const context = {
        network: deployment.network,
        registry: deployment.registry,
        template: deployment.template,
        postbox: id,
        controller: account.account.owner_public_key,
        keyVersion,
      };
      if (!prepared) {
        const result =
          wallet instanceof SapientSession
            ? await chain.storeSapientCapsule(
                wallet,
                context,
                recoveryFee,
                browserStorage,
              )
            : await wallet
                .nativeMailbox()
                .store(
                  account.account.component_address,
                  context,
                  recoveryFee,
                  browserStorage,
                );
        setPrepared(
          readPending(browserStorage).find(
            (p) => p.id === result.transactionId,
          ),
        );
        onStatus(
          `Recovery backup submitted. Waiting for confirmation before ${rotating ? "updating your encryption key" : "opening your postbox"}. Transaction: ${result.transactionId}.`,
        );
        return;
      }
      const c = prepared.capsule;
      if (
        prepared.state !== "confirmed" ||
        !c ||
        c.account !== account.account.component_address ||
        c.context.postbox !== id ||
        c.context.keyVersion !== keyVersion ||
        c.context.controller !== context.controller ||
        c.context.network !== context.network ||
        c.context.registry !== context.registry ||
        c.context.template !== context.template
      )
        throw new Error(
          "Confirm and resume the recovery setup for this postbox and account",
        );
      encryptionKey = JSON.stringify(c.descriptor);
    }
    const tx = await chain.savePostbox(
      wallet,
      account,
      {
        id,
        nickname,
        discoverable,
        encryptionKey,
        controller: account.account.owner_public_key,
      },
      operation,
      fee,
      browserStorage,
    );
    onStatus(
      `Postbox change submitted. Check its confirmation in Activity. Transaction: ${tx}.`,
    );
    setEditing(false);
    setPrepared(undefined);
    setRotating(false);
    onActivity();
  }
  return (
    <section className="page-panel inbox-page">
      <span className="kicker">YOUR PRIVATE POST OFFICE</span>
      <h1>
        Your <em>haunted inbox.</em>
      </h1>
      <p>
        A quiet place for letters meant just for you. Your Sapient wallet
        unlocks your postboxes, even when you reconnect on another device.
      </p>
      {!wallet ? (
        <div className="inbox-welcome">
          <div className="welcome-ghost" aria-hidden="true">
            ✉
          </div>
          <h2>A home for your little secrets.</h2>
          <p>
            Connect Sapient to open your mail or create your first postbox. Your
            letters are encrypted for you.
          </p>
          <button className="primary" onClick={onConnect}>
            Connect Sapient for my inbox
          </button>
          <p className="fine-print">
            Public mail and private links still open without connecting.
          </p>
        </div>
      ) : (
        <>
          {owned.length > 0 && (
            <label>
              My postboxes
              <select
                disabled={busy}
                value={selected}
                onChange={(e) => choose(e.target.value)}
              >
                <option value="">Select a postbox</option>
                {owned.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname} · {p.id}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!owned.length && !editing && (
            <div className="info">
              <h2>Your first postbox awaits.</h2>
              <p>
                Give it a name and let friends send you private mail. Setup
                includes a private-view permission and two transaction approvals
                in Sapient: first your encrypted backup, then your postbox.
              </p>
            </div>
          )}
          <div className="actions">
            <button
              onClick={() => {
                choose("");
                setEditing(true);
              }}
              disabled={busy}
            >
              {owned.length ? "Create another postbox" : "Create my postbox"}
            </button>
            <button onClick={() => void task(onRefresh)} disabled={busy}>
              Refresh postboxes & inbox
            </button>
            {box && (
              <button onClick={() => setEditing(true)} disabled={busy}>
                Edit selected postbox
              </button>
            )}
          </div>
          {wallet instanceof SapientSession &&
            (editing || box || prepared) &&
            !viewApproved && (
              <div className="info">
                <h3>Let Sapient unlock your letters</h3>
                <p>
                  Postbox recovery needs your permission. This lets GhostDrop
                  read the connected account's private output summaries,
                  including amounts and memos for other resources. It does not
                  reveal your wallet seed or signing keys.{" "}
                  {editing && (!box || rotating)
                    ? "This permission comes before the two transaction approvals."
                    : "Approve this permission to read your private mail. Opening a letter does not send a transaction."}
                </p>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={viewAcknowledged}
                    disabled={busy}
                    onChange={(e) => setViewAcknowledged(e.target.checked)}
                  />
                  I understand the account-wide private view permission
                </label>
                <button
                  disabled={
                    busy ||
                    !viewAcknowledged ||
                    !(
                      enabled ||
                      prepared?.capsule?.descriptor.recovery ===
                        "sapient-capsule-1" ||
                      (box &&
                        inbox.some(
                          (e) =>
                            "recovery" in e.payload &&
                            e.payload.recovery === "sapient-capsule-1",
                        ))
                    )
                  }
                  onClick={() =>
                    void task(async () => {
                      await wallet.requestPostboxViewAccess();
                      setViewApproved(true);
                      onStatus(
                        "Sapient private view access approved. Disconnect to revoke this site's wallet access.",
                      );
                    })
                  }
                >
                  Approve postbox view access
                </button>
              </div>
            )}
          {!editing && recoverySetups.length > 0 && (
            <div>
              <h2>Resume recovery setup</h2>
              <p className="fine-print">
                These records contain public setup details only. Keep uncertain
                attempts until wallet history is reconciled.
              </p>
              {recoverySetups.map((p) => (
                <button key={p.id} disabled={busy} onClick={() => resume(p)}>
                  {p.capsule!.context.postbox} · key{" "}
                  {p.capsule!.context.keyVersion} · {p.state}
                </button>
              ))}
            </div>
          )}
          {editing && (
            <form
              className="postbox-setup"
              onSubmit={(e) => {
                e.preventDefault();
                void task(() =>
                  save(rotating ? "rotate" : box ? "edit" : "create"),
                );
              }}
            >
              {(!box || rotating) && (
                <ol className="setup-steps" aria-label="Postbox setup progress">
                  <li
                    className={
                      prepared?.state === "confirmed"
                        ? "complete"
                        : viewApproved
                          ? "current"
                          : ""
                    }
                  >
                    Approval 1 of 2 · Save encrypted backup
                  </li>
                  <li
                    className={
                      prepared?.state === "confirmed" && viewApproved
                        ? "current"
                        : ""
                    }
                  >
                    {rotating
                      ? "Approval 2 of 2 · Update encryption key"
                      : "Approval 2 of 2 · Open your postbox"}
                  </li>
                </ol>
              )}
              {!box && wallet.accounts.length > 1 && (
                <label>
                  Controlling account
                  <select
                    value={controller}
                    disabled={busy || !!prepared}
                    onChange={(e) => setController(Number(e.target.value))}
                  >
                    {wallet.accounts.map((a, i) => (
                      <option key={a.account.component_address} value={i}>
                        {a.account.name} · {a.account.component_address}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Postbox name
                <input
                  value={nickname}
                  disabled={busy}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={POSTBOX_NAME_LIMIT}
                  aria-invalid={!!nickname && !!nameError}
                  aria-describedby={
                    nickname && nameError ? "postbox-name-error" : undefined
                  }
                  required
                />
              </label>
              {nickname && nameError && (
                <p id="postbox-name-error" className="error" role="alert">
                  {nameError}
                </p>
              )}
              {(!box || rotating) && (
                <>
                  <details className="advanced">
                    <summary>
                      Backup fee limit · {tari(recoveryFee)} TARI
                    </summary>
                    <AmountInput
                      label="Maximum backup fee per attempt"
                      value={recoveryFee}
                      disabled={busy || !!prepared}
                      onChange={setRecoveryFee}
                    />
                  </details>
                  <p className="fine-print">
                    Your backup is encrypted on Ootle so the same Sapient wallet
                    can restore your mail later. Confirm the backup below before
                    opening the postbox.
                  </p>
                  {prepared && (
                    <div className="info backup-status">
                      <strong>
                        {prepared.state === "confirmed"
                          ? "Your recovery backup is ready."
                          : prepared.state === "rejected"
                            ? "Your backup was not completed."
                            : prepared.state === "unknown"
                              ? "Your backup needs a status check."
                              : "Waiting for your recovery backup…"}
                      </strong>
                      <p>
                        {prepared.state === "confirmed"
                          ? rotating
                            ? "The next approval updates your encryption key. Your encrypted backup stays on Ootle."
                            : "The next approval opens your postbox. Your encrypted backup stays on Ootle."
                          : prepared.state === "submitted"
                            ? "Keep this setup until its outcome is clear. Known transactions are checked automatically for up to two minutes; no wallet approval is resumed automatically."
                            : "Keep the original setup and inspect Sapient history before trying again. Use the status or approval button below to check this same request."}
                      </p>
                      <details>
                        <summary>Backup transaction details</summary>
                        <code>{prepared.id}</code>
                      </details>
                      <button
                        type="button"
                        disabled={
                          busy ||
                          !chain ||
                          (prepared.id.startsWith("attempt:") &&
                            (writeBlocked || !prepared.walletRequest))
                        }
                        onClick={() => void task(confirmRecovery)}
                      >
                        {prepared.id.startsWith("attempt:")
                          ? "Resume Sapient approval"
                          : "Check backup status"}
                      </button>
                    </div>
                  )}
                </>
              )}
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={discoverable}
                  disabled={busy}
                  onChange={(e) => setDiscoverable(e.target.checked)}
                />
                Let people find this postbox in the directory
              </label>
              <details className="advanced">
                <summary>Postbox fee limit · {tari(fee)} TARI</summary>
                <AmountInput
                  label="Maximum postbox fee per attempt"
                  value={fee}
                  disabled={busy}
                  onChange={setFee}
                />
              </details>
              <p className="fine-print">
                Sapient shows its fee estimate before approval. Your connected
                account pays the fee for each attempt.
              </p>
              {(!box || rotating) && (
                <div className="setup-summary">
                  <h3>
                    {prepared?.state === "confirmed"
                      ? "Ready for your second approval · 2 of 2"
                      : "Two transaction approvals in Sapient"}
                  </h3>
                  <p>
                    {prepared?.state === "confirmed"
                      ? "Approval 1 of 2 is confirmed. Review your details below, then approve the second transaction in Sapient to finish setup."
                      : "First approve Save recovery backup in Sapient. Wait for confirmation, then return here for approval 2 of 2 to finish setup. Each transaction has its own network fee."}
                  </p>
                  <dl className="receipt">
                    <div>
                      <dt>Postbox name</dt>
                      <dd>{nickname || "Choose a name above"}</dd>
                    </div>
                    <div>
                      <dt>Directory</dt>
                      <dd>
                        {discoverable
                          ? "People can find me"
                          : "Unlisted · share my ID"}
                      </dd>
                    </div>
                    <div>
                      <dt>Backup fee limit</dt>
                      <dd>{tari(recoveryFee)} TARI per attempt</dd>
                    </div>
                    <div>
                      <dt>Postbox fee limit</dt>
                      <dd>{tari(fee)} TARI per attempt</dd>
                    </div>
                  </dl>
                </div>
              )}
              <button
                className="primary"
                disabled={
                  !enabled ||
                  !!nameError ||
                  (!!prepared && prepared.state !== "confirmed") ||
                  (wallet instanceof SapientSession &&
                    (!box || rotating) &&
                    !viewApproved)
                }
              >
                {box && !rotating
                  ? "Save postbox changes"
                  : !prepared
                    ? "1 of 2 · Save recovery backup"
                    : prepared.state !== "confirmed"
                      ? "Finish backup step · 1 of 2"
                      : rotating
                        ? "2 of 2 · Use the new encryption key"
                        : "2 of 2 · Open my postbox"}
              </button>
              {box && !rotating && (
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={() => {
                    setPrepared(undefined);
                    setRotating(true);
                  }}
                >
                  Rotate encryption key
                </button>
              )}
            </form>
          )}
          {box && (
            <details className="mailbox-address-settings">
              <summary>Postbox address & settings</summary>
              <article className="postbox">
                <h2>{box.nickname}</h2>
                <CopyField
                  label="My postbox ID"
                  buttonLabel="Copy my postbox ID"
                  copiedMessage="Postbox ID copied. Share it with a friend so they can write to you."
                  value={box.id}
                />
                {invitationLink && (
                  <CopyField
                    label="My postbox invitation"
                    buttonLabel="Copy postbox invitation"
                    copiedMessage="Postbox invitation copied. Send it to a friend so they can choose you as their recipient."
                    value={invitationLink}
                    multiline
                  />
                )}
                <p className="fine-print">
                  Share this public address with a friend. It lets them write to
                  you, including when your postbox is unlisted; it gives no
                  access to your wallet or inbox.
                </p>
                <p>
                  {box.discoverable ? "Visible in the directory" : "Unlisted"} ·
                  Controlling account {account?.account.name}
                </p>
                <details className="advanced">
                  <summary>About key rotation</summary>
                  <p className="fine-print">
                    Rotation affects new mail. Historical key versions remain
                    recoverable through their original recovery route. Rotation
                    changes only the encryption key; save nickname and listing
                    changes separately.
                  </p>
                </details>
              </article>
            </details>
          )}
          {box && (
            <>
              <MailReadNotice
                ids={unavailableLetterIds}
                busy={busy || loadingMore}
                onRetry={() => void task(onRefresh)}
              />
              <MailboxWorkspace
                key={JSON.stringify([
                  deployment.network,
                  deployment.registry,
                  deployment.template,
                  box.id,
                  box.controller,
                ])}
                box={box}
                letters={letters}
                plain={plain}
                activeId={activeId}
                busy={busy}
                canUnlock={!(wallet instanceof SapientSession) || viewApproved}
                onOpen={onOpen}
                onClose={onClose}
                onCompose={() => onCompose(box)}
                onUnlock={(mail) =>
                  void task(async () => {
                    let opened = 0;
                    for (const e of mail) {
                      await onRead(e);
                      opened++;
                    }
                    onStatus(
                      `${opened} letters unlocked for this wallet session. No transaction was sent.`,
                    );
                  })
                }
                onReaderTarget={onReaderTarget}
              />
              {hasMore && (
                <button
                  disabled={busy || loadingMore}
                  onClick={() => void onMore()}
                >
                  {loadingMore ? "Loading more letters…" : "Load more letters"}
                </button>
              )}
            </>
          )}
        </>
      )}
      {!writesReady(deployment, "postbox", "sapient") && (
        <p className="info">
          Postbox writes await verified Sapient key recovery. Connecting a
          wallet for signing does not give GhostDrop a recoverable mail
          decryption key. Existing postbox keys are preserved; no extra bridge
          is required.
        </p>
      )}
    </section>
  );
}
