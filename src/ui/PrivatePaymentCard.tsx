import type { PrivatePayment } from "../core/private-payment";
import { AmountInput, tari } from "./AmountInput";
import { CopyField } from "./CopyField";

export function PrivatePaymentCard({
  payment,
  busy = false,
  onPay,
  onImport,
  review = false,
  onConfirm,
  onCancel,
  fee = "30000",
  onFee,
  notice,
}: {
  payment: PrivatePayment;
  busy?: boolean;
  onPay?: () => void;
  onImport?: () => void;
  review?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  fee?: string;
  onFee?: (value: string) => void;
  notice?: string;
}) {
  return (
    <section className="private-payment-card" aria-label="Private payment">
      <strong>
        {payment.kind === "request"
          ? "Private payment request"
          : payment.kind === "intent"
            ? "Private payment recovery record"
            : "Private payment receipt"}{" "}
        · {tari(payment.amount)} test TARI
      </strong>
      <p>
        {payment.kind === "request"
          ? "The receiving address and amount are inside this encrypted letter. Opening it does not approve or send funds."
          : payment.kind === "intent"
            ? "This record preserves the original Sapient approval. It is not proof that money arrived; look for the verified payment receipt."
            : "The recipient can verify the committed output and import it into Sapient. Importing needs private view access and sends no transaction."}
      </p>
      <details>
        <summary>Private receiving details</summary>
        <CopyField
          label="Payment receiving address"
          value={payment.destination}
          buttonLabel="Copy private receiving address"
          copiedMessage="Receiving address copied."
          multiline
        />
        {payment.kind === "receipt" && (
          <p>
            Transaction <code>{payment.transactionId}</code>
          </p>
        )}
      </details>
      {onPay && !review && (
        <button disabled={busy} onClick={onPay}>
          Review private payment
        </button>
      )}
      {onImport && (
        <button disabled={busy} onClick={onImport}>
          Verify & import in Sapient
        </button>
      )}
      {review && (
        <div
          className="private-payment-review"
          role="group"
          aria-label="Private payment review"
        >
          <p>
            <strong>Three Sapient approvals.</strong> First authorize the
            payment, then save an encrypted recovery record, then deliver its
            receipt. MoonMail submits the payment only after the recovery record
            commits. Postage is separate; this is not an atomic mail-and-payment
            transaction.
          </p>
          {onFee && (
            <AmountInput
              label="Maximum fee per payment step and attempt"
              value={fee}
              disabled={busy}
              onChange={onFee}
            />
          )}
          <p className="fine-print">
            Private funding only. No public fallback. Sapient may retry an
            execution and charge another fee. After a partial failure, resume
            this original request. A fresh wallet installation may need the
            original Sapient installation to retrieve a missing approval result.
          </p>
          <div className="actions">
            <button className="primary" disabled={busy} onClick={onConfirm}>
              Continue with Sapient
            </button>
            <button disabled={busy} onClick={onCancel}>
              Cancel payment review
            </button>
          </div>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
