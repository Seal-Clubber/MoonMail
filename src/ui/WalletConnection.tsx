import { useEffect, useRef, useState } from "react";
import { UiIcon } from "./UiIcon";
import { useActionFocus } from "./useActionFocus";

function connectionHelp(error: unknown, network: string) {
  const message =
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  if (/choose a supported network/i.test(message))
    return {
      title: "This office uses an unsupported network",
      text: "Open MoonMail’s Settings and restore the Esmeralda defaults, then connect again.",
    };
  if (/one selected account|account changed|different account/i.test(message))
    return {
      title: "Choose your Sapient account",
      text: "Open Sapient, select the account you want to use with MoonMail, then connect again.",
    };
  if (code === 4100)
    return {
      title: "Check your wallet access",
      text: "Unlock Sapient, select your account and check MoonMail’s access in the wallet’s connected sites. Then try again.",
    };
  if (/switch sapient|another network|wrong.*network/i.test(message))
    return {
      title: `Choose ${network} in Sapient`,
      text: `Open Sapient’s settings, switch to ${network} testnet, then try connecting again.`,
    };
  if (code === 4001 || /reject|declin|cancel|denied/i.test(message))
    return {
      title: "Connection wasn’t approved",
      text: "That’s okay. When you’re ready, try again and approve MoonMail in Sapient.",
    };
  if (code === -32002 || /already.*pending|request.*pending/i.test(message))
    return {
      title: "Check your open Sapient request",
      text: "Finish or dismiss the connection request already waiting in Sapient, then try again.",
    };
  if (/lock|unlock/i.test(message))
    return {
      title: "Unlock your wallet",
      text: "Open the Sapient extension, unlock it and select your account. Then try again here.",
    };
  if (/update sapient|not supported|unsupported|capabilit/i.test(message))
    return {
      title: "Sapient needs an update",
      text: "Update Sapient from its official download page, reopen your wallet, then reload MoonMail.",
    };
  if (/not detected/i.test(message))
    return {
      title: "Sapient isn’t available in this tab",
      text: "Check that the extension is enabled for this browser and site. Reload MoonMail if you just installed it.",
    };
  if (/timed out|timeout/i.test(message))
    return {
      title: "We’re still not connected",
      text: "Check Sapient for a waiting connection request. Finish or dismiss it before trying again.",
    };
  return {
    title: "We couldn’t connect",
    text: "Open Sapient, unlock it and select your account. Check the network, then try again. Connecting does not spend funds.",
  };
}

export function WalletConnection({
  available,
  busy,
  network,
  onCheck,
  onConnect,
}: {
  available: boolean;
  busy: boolean;
  network: string;
  onCheck(): boolean;
  onConnect(): Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof connectionHelp>>();
  const [checked, setChecked] = useState(false);
  const connectFocus = useActionFocus(pending, !!failure);
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const waiting = pending || busy;
  return (
    <div className="wallet-connection">
      <p className="wallet-intro">
        Your wallet connects you to your postbox. You stay in control of every
        permission and payment.
      </p>
      <div className="wallet-provider-card">
        <span className="wallet-provider-icon">
          <UiIcon name="privacy" />
        </span>
        <div>
          <strong>Sapient</strong>
          <span>Wallet for Tari Ootle</span>
        </div>
        <span className={`wallet-detection ${available ? "detected" : ""}`}>
          {available ? "Detected" : "Not detected"}
        </span>
      </div>
      {available ? (
        <>
          <ol className="wallet-connect-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Open and unlock Sapient</strong>
                <p>
                  Choose your account on <b>{network} testnet</b>.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Approve the connection</strong>
                <p>
                  Continue below, then approve MoonMail in the wallet popup.
                </p>
              </div>
            </li>
          </ol>
          {failure && (
            <div className="wallet-connect-notice" role="alert">
              <strong>{failure.title}</strong>
              <p>{failure.text}</p>
              {failure.title === "Sapient needs an update" && (
                <a
                  href="https://sapient.tari.mw/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Sapient downloads ↗
                </a>
              )}
            </div>
          )}
          {pending && (
            <div className="wallet-connect-notice waiting" role="status">
              <strong>Continue in Sapient</strong>
              <p>
                Open the extension if the popup is hidden. MoonMail is waiting
                for your connection approval.
              </p>
              <small>
                Closing this window does not cancel a request already open in
                Sapient.
              </small>
            </div>
          )}
          <button
            ref={connectFocus.ref}
            className="primary wallet-connect-primary"
            disabled={waiting}
            onClick={async () => {
              if (inFlight.current) return;
              connectFocus.remember();
              inFlight.current = true;
              setFailure(undefined);
              setPending(true);
              try {
                await onConnect();
              } catch (error) {
                if (active.current) setFailure(connectionHelp(error, network));
              } finally {
                inFlight.current = false;
                if (active.current) setPending(false);
              }
            }}
          >
            {pending ? "Waiting for Sapient…" : "Connect Sapient"}
          </button>
        </>
      ) : (
        <>
          <div className="wallet-install-copy">
            <h3>Need a wallet?</h3>
            <p>
              Get the Sapient browser extension, create or restore your wallet,
              then return to this tab.
            </p>
          </div>
          <div className="wallet-connect-actions">
            <a
              className="primary wallet-install"
              href="https://sapient.tari.mw/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get Sapient wallet ↗
            </a>
            <button
              disabled={waiting}
              onClick={() => {
                setChecked(!onCheck());
                setFailure(undefined);
              }}
            >
              Check again
            </button>
          </div>
          {checked && (
            <p role="status" className="wallet-check-result">
              Still not detected. Enable Sapient in this browser and allow
              access to this site, then reload the page if needed.
            </p>
          )}
          <details className="wallet-troubleshooting">
            <summary>I already have Sapient</summary>
            <p>
              Use the browser where Sapient is installed and enable its access
              to this site. Private browsing may need separate extension
              permission. On a phone, use a browser that supports Sapient;
              installing it on a computer does not add it to your phone.
            </p>
          </details>
        </>
      )}
      <div className="wallet-permission-note">
        <UiIcon name="privacy" />
        <p>
          Connecting shares your wallet address.{" "}
          <strong>
            Reading private mail and spending funds need separate approvals.
          </strong>{" "}
          MoonMail never asks for your recovery phrase.
        </p>
      </div>
      <p className="wallet-guest-note">
        Just looking around? Public letters and private links open without a
        wallet.
      </p>
    </div>
  );
}
