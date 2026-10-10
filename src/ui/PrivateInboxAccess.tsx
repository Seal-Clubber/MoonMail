import { useEffect, useRef, useState } from "react";
import { SapientSession } from "../core/sapient";
import { GhostMark } from "./GhostMark";

// Remember only that the explanation was dismissed, never permission itself.
const explained = new WeakMap<SapientSession, Set<string>>();

export function PrivateInboxAccess({
  wallet,
  scope,
  setup,
  busy,
  task,
  onGranted,
}: {
  wallet: SapientSession;
  scope: string;
  setup: boolean;
  busy: boolean;
  task: (fn: () => Promise<void>) => Promise<void>;
  onGranted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = useRef<object | null>(null);
  const requestVersion = useRef(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const token = {};
    current.current = token;
    if (!explained.get(wallet)?.has(scope)) dialog.current?.showModal();
    return () => {
      current.current = null;
      dialog.current?.close();
    };
  }, [wallet, scope]);
  function dismiss() {
    requestVersion.current++;
    const scopes = explained.get(wallet) ?? new Set<string>();
    scopes.add(scope);
    explained.set(wallet, scopes);
    dialog.current?.close();
    trigger.current?.focus();
  }
  async function approve() {
    if (pending || busy) return;
    const token = current.current;
    const version = ++requestVersion.current;
    setPending(true);
    setError("");
    await task(async () => {
      try {
        await wallet.requestPostboxViewAccess();
        if (
          current.current !== token ||
          requestVersion.current !== version ||
          !dialog.current?.open
        )
          return;
        onGranted();
      } catch (e) {
        if (
          current.current === token &&
          requestVersion.current === version &&
          dialog.current?.open
        )
          setError(
            e instanceof Error && /declined/i.test(e.message)
              ? "Permission was not approved in Sapient. Your inbox is still locked."
              : "Sapient could not approve access. Check the connected account and network, then try again.",
          );
      } finally {
        if (current.current === token) setPending(false);
      }
    });
  }
  return (
    <>
      <div className="mailbox-view-access">
        <div>
          <strong>Your private inbox is locked</strong>
          <p>
            {setup
              ? "This permission comes before the two transaction approvals."
              : "Unlock with Sapient to read your encrypted letters."}
          </p>
        </div>
        <button
          ref={trigger}
          disabled={busy || pending}
          onClick={() => dialog.current?.showModal()}
        >
          Unlock private inbox
        </button>
      </div>
      <dialog
        ref={dialog}
        className="private-inbox-dialog"
        aria-labelledby="private-inbox-title"
        aria-describedby="private-inbox-scope"
        onCancel={(e) => {
          e.preventDefault();
          dismiss();
        }}
      >
        <GhostMark />
        <p className="eyebrow">Your letters, behind the veil</p>
        <h2 id="private-inbox-title">Unlock your private inbox</h2>
        <p>
          Sapient keeps your letters encrypted. Give GhostDrop permission to
          find your postbox backup and open your mail.
        </p>
        <div className="private-inbox-disclosure" id="private-inbox-scope">
          <strong>This permission covers your whole connected account.</strong>
          <p>
            GhostDrop can read its private output summaries, including amounts
            and memos for other resources. It does not reveal your wallet seed
            or signing keys.
          </p>
        </div>
        <p>
          Opening a letter does not send a transaction.{" "}
          {setup &&
            "This permission comes before the two transaction approvals."}
        </p>
        <p className="fine-print">
          Choose Continue in Sapient to request this permission, then approve it
          in your wallet. Disconnect to revoke this site's wallet access.
        </p>
        {error && (
          <p role="alert" className="private-inbox-error">
            {error} You can retry or choose Not now.
          </p>
        )}
        {pending && (
          <p role="status">
            Waiting for Sapient� Check your wallet for the permission request.
          </p>
        )}
        <div className="private-inbox-actions">
          <button
            autoFocus
            disabled={busy || pending}
            onClick={() => void approve()}
          >
            {pending ? "Waiting for Sapient�" : "Continue in Sapient"}
          </button>
          <button onClick={dismiss}>Not now</button>
        </div>
      </dialog>
    </>
  );
}
