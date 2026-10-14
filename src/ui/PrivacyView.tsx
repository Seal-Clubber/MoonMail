import type { MailMode } from "../core/types";

export function PrivacyView({
  mode = "postbox",
  compact = false,
}: {
  mode?: MailMode;
  compact?: boolean;
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
          </ul>
        </section>
        <section>
          <h3>Visible on the public chain</h3>
          <ul>
            <li>
              Letter ID, transaction timing, network and contract addresses
            </li>
            <li>Sender identity and any included reply postbox</li>
            {mode === "postbox" && (
              <li>Recipient postbox ID and its controlling public key</li>
            )}
            <li>
              Gift amount, collection reserve, collection status and payout
              destination
            </li>
            <li>
              Postbox registration, public keys and changes to encrypted mailbox
              state
            </li>
          </ul>
        </section>
      </div>
      <p className="privacy-boundary">
        MoonMail does not provide anonymity. An unlisted postbox is still on
        chain. Private postage does not hide the letter’s routing or turn its
        public gift vault into a private payment.
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
        such as your IP address and requests. Sealed addressing and
        conversation-specific identities are not enabled in this deployed
        contract.
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
