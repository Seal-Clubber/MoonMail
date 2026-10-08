import type { Envelope, Letter, MailMode } from "../core/types";
import type { Pending } from "../core/pending";
import type { MailFilter } from "../core/mail-search";
import { emptyDeployment } from "../core/config";

// Fictional UI examples only. Never put these in the transaction journal or send
// their placeholder payloads to a wallet, indexer or contract.
const stories: [string, string, MailMode][] = [
  [
    "To whoever needs a little light",
    "The nights are getting longer. Here is a small reminder: even a haunted house is a home to someone.\n\nLeave a little kindness behind you.\n— A wandering soul",
    "public",
  ],
  [
    "A sealed little secret",
    "Meet me beneath the clock that always strikes thirteen. Bring the blue umbrella.\n\nThis is fictional sample mail: real private letters need their complete private link.",
    "link",
  ],
  [
    "A message from the other side",
    "If the clerk offers you tea, say yes. If the tea offers you advice, listen carefully.\n\nA little kindness, delivered through Sapient.",
    "public",
  ],
  [
    "Coffee for the night shift",
    "To the person keeping the lights on while the rest of us sleep: this little sample gift is for your next coffee.\n\nThank you for being there.",
    "public",
  ],
  [
    "The spare key is under the moon",
    "You left your scarf in the observatory. I have folded it beside the telescope.\n\nP.S. The astronomer insists the moon has been following us.",
    "link",
  ],
  [
    "The library is open late",
    "Tonight’s reading room has room for one more chair. Bring a story, a blanket, or just yourself.\n\nNo need to say anything if you would rather listen.",
    "public",
  ],
  [
    "For the keeper of this postbox",
    "Your little corner of the post office feels like home. Here is a note meant for you alone.\n\nSample addressed mail; no real postbox has received this letter.",
    "postbox",
  ],
  [
    "A recipe passed down by ghosts",
    "One cup of cocoa. A pinch of cinnamon. Two patient stirs.\n\nServe beside a window on a rainy evening. Best shared with someone who has had a long day.",
    "public",
  ],
  [
    "Do not open until midnight",
    "By the time you read this, the lanterns will be lit. Look for the one with a silver ribbon.\n\nThe rest of the surprise is yours to discover.",
    "link",
  ],
  [
    "Lost: one very small shadow",
    "Answers to “Moth.” Last seen near the bakery. May be pretending to be a cat.\n\nIf found, please offer a warm windowsill.",
    "public",
  ],
  [
    "Your parcel has grown wings",
    "I am keeping it in the attic until you come by. It likes the sound of rain and refuses to sit still.\n\nA fictional postbox update from the night porter.",
    "postbox",
  ],
  [
    "A tiny gift, just because",
    "You do not need a reason to leave something kind behind.\n\nThe amount on this card is a simulated sample, not spendable TARI.",
    "public",
  ],
  [
    "Someone remembered your birthday",
    "Happy birthday from the other side of the street. I hope this year brings you a good surprise.\n\nThe cake is imaginary, but the wish is sincere.",
    "link",
  ],
  [
    "Thanks for returning the book",
    "The last reader left a pressed leaf between pages 42 and 43. I have kept it there for the next wandering soul.",
    "public",
  ],
  [
    "A rainy Tuesday hello",
    "Nothing mysterious today. Just a hello, a warm lamp, and a reminder to take your umbrella.",
    "public",
  ],
  [
    "The bell tower invitation",
    "There is a chair waiting for you at the top of the stairs. The view is worth the climb.\n\nWe start when the town goes quiet.",
    "link",
  ],
  [
    "A note for my future self",
    "Remember the afternoon you thought everything was impossible, and then made a start anyway?\n\nKeep this in your postbox for another day like that.",
    "postbox",
  ],
  [
    "Pay it forward, wandering soul",
    "Someone left me a kind note last week. I am passing the feeling along.\n\nIf you can, leave a little light for the next person.",
    "public",
  ],
  [
    "A postcard with no return address",
    "The sea was dark blue today. The lighthouse kept blinking as though it knew a joke.\n\nWish you could see it.",
    "public",
  ],
  [
    "The garden gate is unlocked",
    "The night flowers opened early. There is enough room on the bench for two.\n\nKeep this invitation between us.",
    "link",
  ],
  [
    "Your old friend says hello",
    "I found the photograph from our first midnight picnic. You were laughing at something just outside the frame.\n\nI hope we get to make another one.",
    "postbox",
  ],
  [
    "A little help from a stranger",
    "No grand story, no strings attached. Just an imaginary gift to show how a public gift looks in a busy post office.",
    "public",
  ],
  [
    "Thank you, whoever you are",
    "A stranger held the door when my hands were full. I never got their name.\n\nMaybe this note finds them.",
    "public",
  ],
  [
    "The password is a poem",
    "I have saved you the last seat at the little theatre. The play begins with a ghost who cannot remember whom it is haunting.",
    "link",
  ],
  [
    "When the whole town was asleep",
    "I walked past the station just after midnight. Every platform was empty except for a man in a velvet coat, holding an envelope.\n\nHe asked if I knew the way to the haunted post office. I pointed him toward the old clock tower. He thanked me, then told me the tower had been demolished thirty years ago.\n\nWe both looked up. There it was, bright as ever, with a single light in its highest window.\n\nBy the time I turned back, he had gone. The envelope was on the bench. On its front, in careful handwriting, were four words:\n\n“Leave a little kindness.”",
    "public",
  ],
  [
    "MoonlitMailWithAnUnusuallyLongUnbrokenSubjectThatStillNeedsToFitComfortablyOnYourPhone",
    "Even long subjects need a comfortable place in the delivery book.\n\nThis sample exercises wrapping without hiding the complete title when you open it.",
    "public",
  ],
  [
    "An update from the archive",
    "We found the letter you asked about. It was filed under “things we meant to say.”\n\nI will keep it safe until you visit.",
    "postbox",
  ],
  [
    "A borrowed constellation",
    "Tonight the sky looks like a letter with all its punctuation missing. I think the stars are waiting for someone to finish the sentence.",
    "link",
  ],
  [
    "Goedemorgen, nachtbraker 🌙",
    "Een klein bericht voor iedereen die nog wakker is.\n\nDe maan houdt de wacht. Jij mag straks rustig slapen.",
    "public",
  ],
  [
    "A lantern at the end of the lane",
    "There is always one house with the porch light on.\n\nTonight, let it be ours.",
    "public",
  ],
  [
    "A quiet place to land",
    "No reply needed. I just wanted your postbox to have something gentle waiting in it.",
    "postbox",
  ],
  [
    "The map is drawn in invisible ink",
    "Hold it close to the lamp and follow the tiny arrows. If the arrows start following you, put the map back in its envelope.",
    "link",
  ],
  [
    "Sample links belong on the page, too",
    "A pasted long link should wrap instead of pushing a phone’s screen sideways:\n\nhttps://example.invalid/letters/this-is-a-fictional-sample-path-for-a-very-long-moonlit-postcard-without-a-shortened-address\n\nThis is example text, not a real private link.",
    "public",
  ],
  [
    "The gift someone already found",
    "This fictional sample gift has been collected. The letter stays readable afterward.\n\nCollected gifts cannot be taken twice.",
    "public",
  ],
  [
    "A final invitation before dawn",
    "The musicians are packing up, but there is time for one last song. Meet us where the street lamps end.",
    "link",
  ],
  [
    "For the next wandering soul",
    "If you have read this far, the clerk has probably offered you tea.\n\nLeave the cup on the counter when you go. Someone else will be along soon.",
    "public",
  ],
];
const amounts = [
  "0",
  "0",
  "0",
  "250000",
  "1000000",
  "0",
  "0",
  "0",
  "2000000",
  "0",
  "500000",
  "100000",
  "0",
  "0",
  "0",
  "5000000",
  "0",
  "1000000",
];
export const sampleMail: Envelope[] = stories.map(
  ([subject, body, mode], i) => ({
    id: `preview-${i + 1}`,
    mode,
    context: emptyDeployment,
    sender: "Fictional sample",
    payload:
      mode === "public"
        ? { subject, body }
        : mode === "link"
          ? {
              version: "gd-link-1",
              iv: "sample-only",
              ciphertext: "Fictional placeholder, not encrypted mail",
              wrapIv: "",
              wrappedClaimKey: "",
              claimPublicKey: "",
            }
          : {
              version: "gd-postbox-1",
              keyVersion: 1,
              recipientKey: "",
              ephemeralPublicKey: "",
              iv: "sample-only",
              ciphertext: "Fictional placeholder, not addressed mail",
            },
    gift: i === 33 ? "1000000" : amounts[i % amounts.length],
    reserve: "0",
    claimed:
      i === 33 || (i > 2 && i % 5 === 0 && amounts[i % amounts.length] !== "0"),
    ...(mode === "postbox"
      ? { recipientPostbox: "sample-night-shift-postbox" }
      : {}),
  }),
);
export function sampleLetter(id: string): Letter | undefined {
  const index = sampleMail.findIndex((letter) => letter.id === id);
  return index < 0
    ? undefined
    : { subject: stories[index][0], body: stories[index][1] };
}
export type SampleMailFilter = MailFilter | "postbox";
export function filterSampleMail(filter: SampleMailFilter, query: string) {
  const needle = query.trim().toLowerCase();
  return sampleMail.filter((letter) => {
    if (filter === "public" && letter.mode !== "public") return false;
    if (filter === "link" && letter.mode !== "link") return false;
    if (filter === "postbox" && letter.mode !== "postbox") return false;
    if (
      filter === "gifts" &&
      (letter.mode !== "public" || letter.claimed || BigInt(letter.gift) <= 0n)
    )
      return false;
    const story = sampleLetter(letter.id)!;
    return (
      !needle ||
      [letter.id, story.subject, story.body].some((value) =>
        value.toLowerCase().includes(needle),
      )
    );
  });
}
const sampleStart = Date.now();
export const sampleActivity: Pending[] = Array.from({ length: 28 }, (_, i) => {
  const operation = (["publish", "claim", "capsule", "postbox"] as const)[
    i % 4
  ];
  const state = (["confirmed", "submitted", "unknown", "rejected"] as const)[
    Math.floor(i / 4) % 4
  ];
  const unresolved = state === "unknown";
  return {
    id: unresolved
      ? `attempt:sample-${i + 1}`
      : (i + 101).toString(16).padStart(64, "0"),
    operation,
    state,
    network: 16,
    registry: "",
    envelopeId:
      operation === "postbox"
        ? `postbox:sample-postbox-${i + 1}`
        : operation === "capsule"
          ? `capsule:sample-postbox-${i + 1}:1`
          : `preview-${i + 1}`,
    createdAt: sampleStart - i * 37 * 60 * 1000,
    ...(operation === "postbox"
      ? {
          postboxAction: (["create", "edit", "rotate"] as const)[
            Math.floor(i / 4) % 3
          ],
        }
      : {}),
  };
});
