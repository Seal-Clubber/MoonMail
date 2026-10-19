import type { Envelope, Letter } from "./types";

export type MailFilter = "all" | "gifts";

// Search only public letter contents and public identifiers. Ciphertext and
// decrypted postbox/link contents must never become a public search index.
export function filterHallMail(
  letters: Envelope[],
  filter: MailFilter,
  query: string,
) {
  const search = query.trim().toLowerCase();
  return letters.filter((letter) => {
    if (letter.mode !== "public") return false;
    if (
      filter === "gifts" &&
      (letter.mode !== "public" || letter.claimed || BigInt(letter.gift) <= 0n)
    )
      return false;
    if (!search) return true;
    if (letter.id.toLowerCase().includes(search)) return true;
    const publicLetter = letter.payload as Letter;
    return (
      publicLetter.subject.toLowerCase().includes(search) ||
      publicLetter.body.toLowerCase().includes(search)
    );
  });
}
