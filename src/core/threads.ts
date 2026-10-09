import type { Envelope, Letter, Postbox, ReplyThread } from "./types";
export function threadMetadata(value: unknown): ReplyThread | undefined {
  const t = value as ReplyThread;
  const id = (v: unknown) =>
    typeof v === "string" && !!v && new TextEncoder().encode(v).length <= 64;
  if (
    !t ||
    typeof t !== "object" ||
    Array.isArray(t) ||
    t.version !== "gd-thread-1" ||
    !id(t.root) ||
    !id(t.parent)
  )
    return;
  return { version: "gd-thread-1", root: t.root, parent: t.parent };
}
export function replyThread(
  parent: Envelope,
  letter: Letter | undefined,
): ReplyThread | undefined {
  if (parent.mode !== "postbox") return;
  return {
    version: "gd-thread-1",
    parent: parent.id,
    root: threadMetadata(letter?.thread)?.root || parent.id,
  };
}
function participants(e: Envelope, boxes: Postbox[]) {
  if (
    e.mode !== "postbox" ||
    !e.replyPostbox ||
    !e.recipientPostbox ||
    !boxes.some((p) => p.id === e.replyPostbox && p.controller === e.sender) ||
    !boxes.some(
      (p) => p.id === e.recipientPostbox && p.controller === e.claimAuthority,
    )
  )
    return;
  return JSON.stringify([e.replyPostbox, e.recipientPostbox].sort());
}
// Join only direct reply edges with matching decrypted metadata and verified routing.
// Equal subjects/root IDs alone never join mail. Locked or missing ancestors stay separate.
export function conversation(
  target: Envelope,
  letters: Envelope[],
  text: ReadonlyMap<string, Letter>,
  boxes: Postbox[],
) {
  const pair = participants(target, boxes);
  if (!pair || !text.has(target.id)) return [target];
  const candidates = new Map(
    letters
      .filter((e) => text.has(e.id) && participants(e, boxes) === pair)
      .map((e) => [e.id, e]),
  );
  const parents = new Map<string, string>();
  for (const e of candidates.values()) {
    const t = threadMetadata(text.get(e.id)?.thread);
    const parent = t && candidates.get(t.parent);
    if (
      parent &&
      parent.id !== e.id &&
      t!.root ===
        (threadMetadata(text.get(parent.id)?.thread)?.root || parent.id)
    )
      parents.set(e.id, parent.id);
  }
  // Reject cycles rather than making a fabricated conversation.
  for (const id of parents.keys()) {
    const seen = new Set<string>();
    let next: string | undefined = id;
    while (next && parents.has(next)) {
      if (seen.has(next)) {
        for (const cyclic of seen) parents.delete(cyclic);
        break;
      }
      seen.add(next);
      next = parents.get(next);
    }
  }
  const connected = new Set([target.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [child, parent] of parents)
      if (connected.has(child) || connected.has(parent)) {
        if (!connected.has(child) || !connected.has(parent)) changed = true;
        connected.add(child);
        connected.add(parent);
      }
  }
  // Parent first; branches preserve loaded post-office order. No invented dates.
  const result: Envelope[] = [],
    added = new Set<string>();
  function add(id: string) {
    if (added.has(id)) return;
    const parent = parents.get(id);
    if (parent && connected.has(parent)) add(parent);
    added.add(id);
    const e = candidates.get(id);
    if (e) result.push(e);
  }
  for (const e of letters) if (connected.has(e.id)) add(e.id);
  return result;
}
