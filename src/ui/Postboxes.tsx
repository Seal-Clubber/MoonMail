import { useState, useEffect } from "react";
import type { Deployment, Envelope, Postbox } from "../core/types";
import type { ConnectedWallet } from "../core/wallet";
import type { PostOfficeClient } from "../core/chain";
import { mailboxKey } from "../core/mailbox";
import { writesReady } from "../core/config";
import { readPending, savePending, type Pending } from "../core/pending";
import { SapientSession } from "../core/sapient";

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
  onOpen,
  onRefresh,
  onMore,
  hasMore,
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
  onOpen: (letter: Envelope) => void;
  onRefresh: () => Promise<void>;
  onMore: () => Promise<void>;
  hasMore: boolean;
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
  useEffect(() => {
    setViewAcknowledged(false);
    setViewApproved(false);
  }, [wallet]);
  const owned = boxes.filter((p) =>
    wallet?.accounts.some((a) => a.account.owner_public_key === p.controller),
  );
  const box = owned.find((p) => p.id === selected),
    account = box
      ? wallet?.accounts.find(
          (a) => a.account.owner_public_key === box.controller,
        )
      : wallet?.accounts[controller];
  const inbox = letters.filter(
    (e) => e.mode === "postbox" && e.recipientPostbox === box?.id,
  );
  const enabled =
    !!wallet &&
    !!chain &&
    writesReady(deployment, "postbox", "sapient") &&
    !busy;
  const recoverySetups = readPending(localStorage).filter((p) => {
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
      const id = await wallet.resume(prepared.id, localStorage);
      current = readPending(localStorage).find((p) => p.id === id)!;
      if (!current)
        throw new Error("Recovery journal missing; reconcile wallet history");
    }
    const result = await chain.reconcile(current.id);
    const state =
      !result || result.outcome === "FeeIntentCommit"
        ? "unknown"
        : result.outcome === "Commit"
          ? "confirmed"
          : "rejected";
    const next: Pending = { ...current, state };
    savePending(localStorage, next);
    setPrepared(next);
    onStatus(
      `Recovery transaction: ${state}. Publication requires a confirmed, readable memo.`,
    );
  }
  async function save(operation: "create" | "edit" | "rotate") {
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
                localStorage,
              )
            : await wallet
                .nativeMailbox()
                .store(
                  account.account.component_address,
                  context,
                  recoveryFee,
                  localStorage,
                );
        setPrepared(
          readPending(localStorage).find((p) => p.id === result.transactionId),
        );
        onStatus(
          `Recovery memo submitted ${result.transactionId}. Confirm it before publishing the key.`,
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
      localStorage,
    );
    onStatus(
      `Postbox ${operation} submitted ${tx}. Reconcile it in Network & verification, then refresh the inbox.`,
    );
    setEditing(false);
    setPrepared(undefined);
    setRotating(false);
  }
  return (
    <section className="page-panel">
      <span className="kicker">BRASS & SECRETS</span>
      <h1>
        My <em>postboxes.</em>
      </h1>
      <p>
        One controlling wallet can own several postboxes. Names may repeat; IDs
        stay distinct. Reconnecting the same wallet preserves their identity.
      </p>
      {!wallet ? (
        <button className="primary" onClick={onConnect}>
          Connect controlling wallet
        </button>
      ) : (
        <>
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
          <div className="actions">
            <button
              onClick={() => {
                choose("");
                setEditing(true);
              }}
              disabled={busy}
            >
              Create another postbox
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
          {wallet instanceof SapientSession && (
            <div className="info">
              <p>
                Sapient postbox recovery needs separate private view access.
                This lets GhostDrop read the connected account's private output
                summaries, including amounts and memos for other resources. It
                does not reveal your wallet seed or signing keys.
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
          {recoverySetups.length > 0 && (
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
              onSubmit={(e) => {
                e.preventDefault();
                void task(() =>
                  save(rotating ? "rotate" : box ? "edit" : "create"),
                );
              }}
            >
              {!box && (
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
                Nickname
                <input
                  value={nickname}
                  disabled={busy}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={80}
                  required
                />
              </label>
              {(!box || rotating) && (
                <>
                  <label>
                    Recovery transaction-fee cap · µTARI
                    <input
                      value={recoveryFee}
                      disabled={busy || !!prepared}
                      inputMode="numeric"
                      onChange={(e) => setRecoveryFee(e.target.value)}
                    />
                  </label>
                  <p className="fine-print">
                    Recovery stores an encrypted application key on Ootle.
                    Confirm its transaction and wallet recovery before
                    publishing the postbox. Existing native-memo setups keep
                    their original route. Choose the verified Sapient postbox
                    office in Network & verification for new setup.
                  </p>
                  {prepared && (
                    <p className="info">
                      Recovery setup {prepared.state} · key{" "}
                      {prepared.capsule?.context.keyVersion}
                      <code>{prepared.id}</code>
                      <button
                        type="button"
                        disabled={
                          busy ||
                          !chain ||
                          (prepared.id.startsWith("attempt:") &&
                            !prepared.walletRequest)
                        }
                        onClick={() => void task(confirmRecovery)}
                      >
                        Check recovery transaction
                      </button>
                    </p>
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
                List in the address ledger
              </label>
              <label>
                Postbox transaction-fee cap · µTARI
                <input
                  value={fee}
                  disabled={busy}
                  inputMode="numeric"
                  onChange={(e) => setFee(e.target.value)}
                />
              </label>
              <p className="fine-print">
                Your controlling account pays this fee. Review the nickname,
                listing choice and cap before submitting.
              </p>
              <button
                className="primary"
                disabled={
                  !enabled ||
                  (!!prepared && prepared.state !== "confirmed") ||
                  (wallet instanceof SapientSession &&
                    (!box || rotating) &&
                    !viewApproved)
                }
              >
                {box && !rotating
                  ? "Save postbox changes"
                  : !prepared
                    ? "Store recovery memo"
                    : rotating
                      ? "Publish rotated key"
                      : "Publish postbox"}
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
            <article className="postbox">
              <h2>{box.nickname}</h2>
              <code>{box.id}</code>
              <p>
                {box.discoverable ? "Listed in ledger" : "Unlisted"} ·
                Controlling account {account?.account.name}
              </p>
              <p className="fine-print">
                Rotation affects new mail. Historical key versions remain
                recoverable through their original recovery route. Rotation
                changes only the encryption key; save nickname and listing
                changes separately.
              </p>
            </article>
          )}
          {box && (
            <>
              <h2>Private inbox</h2>
              {inbox.length ? (
                inbox.map((e) => (
                  <button
                    className="postbox"
                    key={e.id}
                    onClick={() => onOpen(e)}
                    disabled={busy}
                  >
                    <span>✉</span> Sealed letter · {e.id}
                    {e.claimed ? " · Gift collected" : ""}
                  </button>
                ))
              ) : (
                <p className="quiet-state">
                  No addressed letters on this loaded page.
                </p>
              )}
              {hasMore && (
                <button disabled={busy} onClick={() => void task(onMore)}>
                  Load more chain mail
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
