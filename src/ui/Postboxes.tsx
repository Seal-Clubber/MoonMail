import { useState } from "react";
import type { Deployment, Envelope, Postbox } from "../core/types";
import type { WalletSession } from "../core/wallet";
import type { PostOfficeClient } from "../core/chain";
import { mailboxKey } from "../core/mailbox";
import { writesReady } from "../core/config";

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
  wallet?: WalletSession;
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
    [editing, setEditing] = useState(false);
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
    !!wallet && !!chain && writesReady(deployment, "postbox") && !busy;
  function choose(id: string) {
    setSelected(id);
    const p = owned.find((p) => p.id === id);
    setNickname(p?.nickname || "");
    setDiscoverable(p?.discoverable ?? true);
    setEditing(false);
  }
  async function save(operation: "create" | "edit" | "rotate") {
    if (!wallet || !chain || !account)
      throw new Error("Connect the controlling wallet");
    const id = box?.id || crypto.randomUUID();
    let encryptionKey = box?.encryptionKey || "";
    if (operation !== "edit") {
      const keyVersion =
        operation === "rotate" ? mailboxKey(encryptionKey).keyVersion + 1 : 1;
      const key = await wallet.postboxPublicKey(
        account.account.component_address,
        {
          network: deployment.network,
          registry: deployment.registry,
          template: deployment.template,
          postbox: id,
          controller: account.account.owner_public_key,
          keyVersion,
        },
      );
      encryptionKey = JSON.stringify(key);
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
  }
  return (
    <section className="page-panel">
      <span className="kicker">BRASS & SECRETS</span>
      <h1>
        My <em>postboxes.</em>
      </h1>
      <p>
        One controlling wallet can own several postboxes. Names may repeat; IDs
        stay distinct. Changing an API key preserves their identity.
      </p>
      {!wallet ? (
        <button className="primary" onClick={onConnect}>
          Connect controlling wallet
        </button>
      ) : (
        <>
          <label>
            My postboxes
            <select disabled={busy} value={selected} onChange={(e) => choose(e.target.value)}>
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
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void task(() => save(box ? "edit" : "create"));
              }}
            >
              {!box && (
                <label>
                  Controlling account
                  <select
                    value={controller}
                    disabled={busy}
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
              <button className="primary" disabled={!enabled}>
                {box ? "Save postbox changes" : "Create postbox"}
              </button>
              {box && (
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={() => void task(() => save("rotate"))}
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
                recoverable from the same wallet seed. Rotation changes only
                the encryption key; save nickname and listing changes separately.
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
      {!writesReady(deployment, "postbox") && (
        <p className="info">
          Postbox writes await verified deployment, wallet transport and key
          recovery. Opening existing mail requires the local GhostDrop wallet
          extension and account-scoped decrypt permission.
        </p>
      )}
    </section>
  );
}
