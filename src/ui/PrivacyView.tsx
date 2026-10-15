import type { MailMode } from "../core/types";

export function PrivacyView({
  mode = "postbox",
  compact = false,
  sealed = false,
  payments = false,
}: {
  mode?: MailMode;
  compact?: boolean;
  sealed?: boolean;
  payments?: boolean;
}) {
  const publicMail = mode === "public";
  const content = (
    <>
      <p>
        {publicMail
          ? "Public mail publishes the subject and message for everyone to read."
          : "Your subject, message and conversation links are encrypted on your device. Encryption protects the content, not all the information around it."}
      </p>
      <div className="privacy-columns">
        <section>
          <h3>{publicMail ? "Public content" : "Under cover"}</h3>
          <ul>
            <li>
              {publicMail
                ? "Subject and full message"
                : "Subject and full message are encrypted"}
            </li>
            <li>
              {publicMail
                ? "Any names or details you include"
                : "Sent copies and mailbox settings are separately encrypted"}
            </li>
            {!publicMail && (
              <li>
                {mode === "link"
                  ? "Anyone with the complete private link can open the letter and collect its gift"
                  : "Recipient recovery keys stay with Sapient; a Sent copy can also be opened by its sender"}
              </li>
            )}
            {sealed && payments && (
              <li>
                Native private payment amounts, receiving addresses and recovery
                memos stay encrypted
              </li>
            )}
          </ul>
        </section>
        <section>
          <h3>Visible on the public chain</h3>
          <ul>
            <li>
              Letter ID, transaction timing, network and contract addresses
            </li>
            <li>
              {sealed
                ? "Transaction signer identity and the padded size bucket"
                : "Sender identity and any included reply postbox"}
            </li>
            {mode === "postbox" && !sealed && (
              <li>Recipient postbox ID and its controlling public key</li>
            )}
            {!sealed && (
              <li>
                Gift amount, collection reserve, collection status and payout
                destination
              </li>
            )}
            <li>
              Postbox names, IDs, controlling public keys and changes to
              encrypted mailbox state
            </li>
            {sealed && payments && (
              <li>
                Payment transaction signers, fees and output commitments; the
                multi-step timing can link mail with a payment
              </li>
            )}
          </ul>
        </section>
      </div>
      <p className="privacy-boundary">
        {sealed
          ? "Recipient and conversation addressing stay encrypted in this sealed office. Public postbox registrations still associate controllers and encryption keys. Private postage does not hide your transaction signer or timing. MoonMail does not provide anonymity."
          : "MoonMail does not provide anonymity. Postbox names, IDs and controlling public keys are public. Private postage does not hide the letter’s routing or turn its public gift vault into a private payment."}
      </p>
      <h3>Two separate permissions</h3>
      <p>
        Reading private mail uses Sapient’s account-wide private view
        permission, including private output amounts and memos for other
        resources. It does not authorize spending. Each transaction needs its
        own approval in Sapient. MoonMail never requests your seed or signing
        keys.
      </p>
      <p className="fine-print">
        The website host and public indexers can observe connection information,
        such as your IP address and requests.{" "}
        {sealed
          ? payments
            ? "Sealed discovery reads shared pages and tries your recovered keys locally. Native payments use separate approvals and an encrypted recovery intent/receipt, not an atomic mail-and-payment transaction. If the original wallet installation and a missing result are lost before receipt delivery, automatic payment discovery is not guaranteed."
            : "Sealed discovery reads shared pages and tries your recovered keys locally. Native payment attachments are not enabled here."
          : "Sealed addressing and conversation-specific identities are not enabled in this deployed contract."}
      </p>
    </>
  );
  return compact ? (
    <details className="privacy-disclosure">
      <summary>What can others see?</summary>
      {content}
    </details>
  ) : (
    <section className="page-panel privacy-page">
      <span className="kicker">PRIVACY, WITHOUT THE MYSTERY</span>
      <h1>What can others see?</h1>
      {content}
    </section>
  );
}
