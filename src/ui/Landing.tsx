import { GhostMark } from "./GhostMark";

export function Landing({
  onOpen,
  onPublic,
  onPrivacy,
}: {
  onOpen: () => void;
  onPublic: () => void;
  onPrivacy: () => void;
}) {
  return (
    <section className="moonmail-landing" aria-labelledby="landing-title">
      <div className="landing-copy">
        <span className="kicker">
          PRIVATE LETTERS · TARI OOTLE · ESMERALDA TESTNET
        </span>
        <h1 id="landing-title">MoonMail</h1>
        <p className="landing-tagline">Your words, under cover of night.</p>
        <p className="landing-intro">
          A familiar mailbox for encrypted letters on Ootle. Write to a friend,
          follow a conversation and keep your Sent mail. Your Sapient wallet
          brings your postbox with you.
        </p>
        <div className="landing-actions">
          <button className="primary" onClick={onOpen}>
            Open mailbox <span aria-hidden="true">↗</span>
          </button>
          <button onClick={onPublic}>Explore public mail</button>
        </div>
        <p className="landing-note">
          Just this website and Sapient. No separate bridge or central mail
          server.
        </p>
        <button className="text-button" onClick={onPrivacy}>
          What can others see?
        </button>
      </div>
      <div className="landing-moon" aria-hidden="true">
        <div className="moon-orbit" />
        <div className="moon-disc" />
        <div className="moon-messenger">
          <GhostMark />
        </div>
        <span className="moon-star star-one">✦</span>
        <span className="moon-star star-two">✧</span>
      </div>
      <div className="landing-features">
        <article>
          <span aria-hidden="true">✉</span>
          <h2>Private by default</h2>
          <p>
            Subjects and messages are encrypted before publishing. Public mail
            is a deliberate choice.
          </p>
        </article>
        <article>
          <span aria-hidden="true">☾</span>
          <h2>Your wallet, your mailbox</h2>
          <p>
            Recover letters, Sent copies and saved mailbox settings with the
            same Sapient wallet on another device.
          </p>
        </article>
        <article>
          <span aria-hidden="true">◇</span>
          <h2>A little generosity</h2>
          <p>
            Request a native private payment inside an encrypted letter, or
            choose a public gift. Review every payment in Sapient.
          </p>
        </article>
      </div>
    </section>
  );
}
