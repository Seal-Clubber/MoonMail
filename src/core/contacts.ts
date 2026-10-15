import type { Envelope, Postbox } from "./types";
export function recipientGroups(
  boxes: Postbox[],
  letters: Envelope[],
  home: Postbox | undefined,
  favourites: string[] = [],
) {
  const known = new Set(favourites);
  const previous = new Set<string>();
  if (home)
    for (const e of letters) {
      if (
        e.mode === "postbox" &&
        e.recipientPostbox === home.id &&
        e.claimAuthority === home.controller &&
        e.replyPostbox &&
        boxes.some((p) => p.id === e.replyPostbox && p.controller === e.sender)
      )
        previous.add(e.replyPostbox);
      if (
        e.mode === "postbox" &&
        e.replyPostbox === home.id &&
        e.sender === home.controller &&
        boxes.some(
          (p) =>
            p.id === e.recipientPostbox && p.controller === e.claimAuthority,
        )
      )
        previous.add(e.recipientPostbox!);
    }
  const order = (a: Postbox, b: Postbox) =>
    a.nickname.localeCompare(b.nickname) || a.id.localeCompare(b.id);
  const fav = boxes.filter((p) => known.has(p.id)).sort(order);
  const past = boxes
    .filter((p) => previous.has(p.id) && !known.has(p.id))
    .sort(order);
  const directory = boxes
    .filter((p) => !known.has(p.id) && !previous.has(p.id))
    .sort(order);
  return [
    { label: "Favourite postboxes", boxes: fav },
    { label: "Previous correspondents", boxes: past },
    { label: "Public directory", boxes: directory },
  ];
}
