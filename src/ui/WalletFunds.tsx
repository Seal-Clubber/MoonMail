import { useEffect, useRef, useState } from "react";
import type { SapientSession } from "../core/sapient";
import { tari } from "./AmountInput";

export function WalletFunds({
  wallet,
  disabled,
}: {
  wallet: SapientSession;
  disabled: boolean;
}) {
  const revision = useRef(0);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">(
    "idle",
  );
  const [balance, setBalance] = useState("");
  useEffect(() => {
    revision.current++;
    setState("idle");
    setBalance("");
    return () => {
      revision.current++;
    };
  }, [wallet]);
  async function check() {
    const current = ++revision.current;
    setState("loading");
    setBalance("");
    try {
      const amount = await wallet.publicTariBalance();
      if (current !== revision.current) return;
      setBalance(amount);
      setState("ready");
    } catch {
      if (current === revision.current) setState("failed");
    }
  }
  return (
    <section className="wallet-funds" aria-label="Funds for MoonMail">
      <h3>Funds for MoonMail</h3>
      <p className="fine-print">
        Sending, attached gift vaults and postbox setup currently use public
        test TARI. Native private postage is paused after a stock Sapient
        signing failure. Sapient shows private funds separately.
      </p>
      <button
        type="button"
        disabled={disabled || state === "loading"}
        onClick={() => void check()}
      >
        {state === "loading"
          ? "Checking public funds…"
          : state === "idle"
            ? "Check public funds"
            : "Recheck public funds"}
      </button>
      <p role="status" className="fine-print">
        {state === "ready"
          ? `Public funds: ${tari(balance)} TARI.`
          : state === "loading"
            ? "Reading your public TARI balance. No approval or spending is requested."
            : state === "failed"
              ? "Public funds could not be checked. Confirm your account and network in Sapient, reconnect if changed, then retry."
              : "This checks public funds only. Private view permission is not requested."}
      </p>
      {state === "ready" && balance === "0" && (
        <p className="info">
          No public TARI is available in this account. If your funds are
          private, use Unshield in Sapient for the amount you want to spend,
          including any gift, collection reserve and public transaction fees.
        </p>
      )}
      {state === "ready" && balance !== "0" && (
        <p className="fine-print">
          This is a balance snapshot. Sapient still checks available funds and
          estimates fees before each transaction.
        </p>
      )}
      <details>
        <summary>My Sapient balance shows zero</summary>
        <p className="fine-print">
          A private payment does not increase Public balance. In Sapient, check
          Private balance or rescan for private payments beside Assets. If a
          payment is missing, open Receive → Claim a private payment and paste
          the commitment supplied by its sender. That loads an existing payment;
          it does not send another one.
        </p>
        <p className="fine-print">
          To use private TARI for MoonMail sending or postbox setup, choose
          Unshield in Sapient and review its amount and fee there. MoonMail
          never asks for your seed or private keys.
        </p>
      </details>
      <p className="fine-print">
        Collecting a funded MoonMail gift uses the sender’s collection reserve
        and needs no recipient coins.
      </p>
    </section>
  );
}
