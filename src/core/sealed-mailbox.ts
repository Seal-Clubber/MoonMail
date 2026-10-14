// Memory-only recovery and composition for the disabled V4 protocol.
import type { Letter, Postbox } from "./types";
import { hex } from "./crypto";
import { mailboxKey } from "./mailbox";
import { SapientSession } from "./sapient";
import { conversationReplyKey } from "./sealed-addressing";
import {
  discoverPrivateMailPage,
  sealPrivateMail,
  type RecoveredSealedKey,
  type RecoveredSealedMail,
  type ReplyIdentity,
  type SealedMailEntry,
  type SealedMessage,
} from "./sealed-mail";
import { SealedOfficeClient, type SealedPostbox } from "./sealed-office";

const fingerprint = (box: SealedPostbox) =>
  JSON.stringify([
    box.id,
    box.controller,
    mailboxKey(box.encryptionKey),
    box.keyHistory,
  ]);
export class SealedMailboxSession {
  private readonly abort = new AbortController();
  private keys: RecoveredSealedKey[] = [];
  private entries = new Map<string, SealedMailEntry>();
  private opened = new Map<string, RecoveredSealedMail>();
  private identities: ReplyIdentity[] = [];
  private cursor = "";
  private loaded = false;
  private finished = false;
  private busy = false;
  private closed = false;
  private external?: { signal: AbortSignal; listener: () => void };
  private constructor(
    readonly client: SealedOfficeClient,
    private wallet: SapientSession,
    readonly box: SealedPostbox,
  ) {}
  static async open(
    client: SealedOfficeClient,
    wallet: SapientSession,
    postbox: string,
    signal?: AbortSignal,
  ) {
    if (
      !(wallet instanceof SapientSession) ||
      wallet.network !== client.profile.network
    )
      throw new Error("Choose the Sapient account on this office's network");
    signal?.throwIfAborted();
    if (!(await wallet.hasPostboxViewAccess()))
      throw new Error("Approve private mail view access separately in Sapient");
    const office = await client.readOffice(),
      box = office.postboxes.find((p) => p.id === postbox);
    if (!box || box.controller !== wallet.accounts[0].account.owner_public_key)
      throw new Error("This wallet does not control that postbox");
    const session = new SealedMailboxSession(
      client,
      wallet,
      structuredClone(box),
    );
    if (signal) {
      const listener = () => session.dispose();
      session.external = { signal, listener };
      signal.addEventListener("abort", listener, { once: true });
      if (signal.aborted) session.dispose();
    }
    try {
      const adapter = wallet.capsuleMailbox((id) =>
          client.provider.getSubstate(id),
        ),
        versions = [...box.keyHistory, mailboxKey(box.encryptionKey)];
      for (const descriptor of versions) {
        session.abort.signal.throwIfAborted();
        const secret = await adapter.recover(
          wallet.accounts[0].account.component_address,
          {
            ...client.profile,
            postbox: box.id,
            controller: box.controller,
            keyVersion: descriptor.keyVersion,
          },
          descriptor,
        );
        if (session.closed) {
          secret.fill(0);
          session.abort.signal.throwIfAborted();
        }
        session.keys.push({
          postbox: box.id,
          keyVersion: descriptor.keyVersion,
          publicKey: descriptor.publicKey,
          controller: box.controller,
          secret,
        });
      }
      await session.assertAccess();
      const latest = (await client.readOffice()).postboxes.find(
        (p) => p.id === box.id,
      );
      if (!latest || fingerprint(latest) !== fingerprint(box))
        throw new Error("Postbox keys changed during recovery; open it again");
      return session;
    } catch (error) {
      session.dispose();
      throw error;
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
    for (const key of this.keys) key.secret.fill(0);
    this.keys = [];
    this.entries.clear();
    this.opened.clear();
    this.identities = [];
    this.external?.signal.removeEventListener("abort", this.external.listener);
    this.external = undefined;
  }
  private async assertAccess() {
    this.abort.signal.throwIfAborted();
    try {
      if (!(await this.wallet.hasPostboxViewAccess()))
        throw new Error("Private view access was revoked; unlock mail again");
      this.abort.signal.throwIfAborted();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  async messages() {
    await this.assertAccess();
    return structuredClone([...this.opened.values()]);
  }
  private async scan(entries: SealedMailEntry[]) {
    const result = await discoverPrivateMailPage(
      entries,
      this.keys,
      this.client.profile,
      this.identities,
      this.abort.signal,
    );
    for (const match of result.matches) this.opened.set(match.id, match);
    const changed = result.identities.length > this.identities.length;
    this.identities = result.identities;
    return changed;
  }
  async loadMore() {
    if (this.busy) throw new Error("Mail discovery is already running");
    this.busy = true;
    try {
      await this.assertAccess();
      if (this.finished)
        return {
          loaded: this.entries.size,
          complete: true,
          unavailableIds: [] as string[],
        };
      const page = await this.client.readPage(
        this.loaded ? this.cursor : "",
        50,
        { allowPartial: true, signal: this.abort.signal },
      );
      const current = page.postboxes.find((p) => p.id === this.box.id);
      if (!current || fingerprint(current) !== fingerprint(this.box)) {
        this.dispose();
        throw new Error("Postbox keys changed; recover the updated mailbox");
      }
      if (
        this.entries.size +
          page.entries.filter((e) => !this.entries.has(e.id)).length >
        4096
      )
        throw new Error("Sealed directory capacity exceeded");
      const changed = await this.scan(page.entries);
      // Discover a later Sent seed before revisiting earlier pages. No replacement
      // payment/publication is involved; these are bounded read/decrypt operations.
      if (changed) {
        const prior = [...this.entries.values()].filter(
          (e) => !this.opened.has(e.id),
        );
        for (let offset = 0; offset < prior.length; offset += 50)
          await this.scan(prior.slice(offset, offset + 50));
      }
      await this.assertAccess();
      for (const entry of page.entries) this.entries.set(entry.id, entry);
      this.cursor = page.nextCursor;
      this.loaded = true;
      this.finished = !page.nextCursor;
      return {
        loaded: this.entries.size,
        complete: this.finished,
        unavailableIds: page.unavailableIds,
      };
    } finally {
      this.busy = false;
    }
  }
  async retryUnavailable(ids: readonly string[]) {
    if (this.busy || ids.length > 50 || new Set(ids).size !== ids.length)
      throw new Error("Retry a unique bounded set after discovery finishes");
    this.busy = true;
    try {
      await this.assertAccess();
      const entries: SealedMailEntry[] = [],
        unavailableIds: string[] = [];
      for (const id of ids) {
        this.abort.signal.throwIfAborted();
        try {
          entries.push(await this.client.readLetter(id));
        } catch {
          unavailableIds.push(id);
        }
      }
      const changed = await this.scan(entries);
      if (changed) {
        const earlier = [...this.entries.values()].filter(
          (e) => !this.opened.has(e.id),
        );
        for (let offset = 0; offset < earlier.length; offset += 50)
          await this.scan(earlier.slice(offset, offset + 50));
      }
      await this.assertAccess();
      for (const entry of entries) this.entries.set(entry.id, entry);
      return { unavailableIds };
    } finally {
      this.busy = false;
    }
  }
  async prepare(
    letter: Letter,
    recipientId: string,
    options: { replyTo?: string; privateReply?: boolean } = {},
  ) {
    await this.assertAccess();
    const office = await this.client.readOffice(),
      sender = office.postboxes.find((p) => p.id === this.box.id);
    if (!sender || fingerprint(sender) !== fingerprint(this.box)) {
      this.dispose();
      throw new Error("Postbox keys changed; unlock again before composing");
    }
    const recipient = office.postboxes.find((p) => p.id === recipientId);
    if (!recipient) throw new Error("Choose a registered receiving postbox");
    const senderKey = mailboxKey(sender.encryptionKey),
      recipientKey = mailboxKey(recipient.encryptionKey);
    const message: SealedMessage = {
      version: "mm-message-1",
      sender: {
        postbox: sender.id,
        keyVersion: senderKey.keyVersion,
        publicKey: senderKey.publicKey,
        controller: sender.controller,
      },
      recipient: {
        postbox: recipient.id,
        keyVersion: recipientKey.keyVersion,
        publicKey: recipientKey.publicKey,
      },
      letter: structuredClone(letter),
    };
    let conversation = hex(crypto.getRandomValues(new Uint8Array(32)));
    if (options.replyTo) {
      const original = this.opened.get(options.replyTo);
      if (!original)
        throw new Error(
          "Open the authenticated original letter before replying",
        );
      const destination = original.inbox
        ? original.message.sender
        : original.message.recipient;
      if (
        recipient.id !== destination.postbox ||
        (original.inbox &&
          recipient.controller !== original.message.sender.controller)
      )
        throw new Error(
          "The selected postbox does not match this conversation",
        );
      const historical = [...recipient.keyHistory, recipientKey].find(
        (k) => k.keyVersion === destination.keyVersion,
      );
      if (
        !historical ||
        ((original.inbox || !original.message.recipient.conversation) &&
          historical.publicKey !== destination.publicKey)
      )
        throw new Error(
          "The original mailbox identity is not in its verified key history",
        );
      conversation =
        original.message.reply?.conversation ??
        original.message.recipient.conversation ??
        conversation;
      if (original.inbox && original.message.reply)
        message.recipient = {
          postbox: recipient.id,
          keyVersion: destination.keyVersion,
          publicKey: original.message.reply.publicKey,
          conversation,
        };
      else if (original.sent && original.message.recipient.conversation)
        message.recipient = { ...original.message.recipient };
      message.letter.thread = {
        version: "gd-thread-1",
        root: original.message.letter.thread?.root ?? original.id,
        parent: original.id,
      };
    } else if (message.letter.thread)
      throw new Error("Thread links require an opened original letter");
    if (options.privateReply) {
      const key = this.keys.find((k) => k.keyVersion === senderKey.keyVersion)!;
      const reply = await conversationReplyKey(
        key.secret,
        this.client.profile,
        conversation,
      );
      try {
        message.reply = { conversation, publicKey: reply.publicKey };
      } finally {
        reply.secret.fill(0);
      }
    }
    const id = hex(crypto.getRandomValues(new Uint8Array(32))),
      payload = await sealPrivateMail(
        message,
        { ...this.client.profile, senderPublicKey: sender.controller },
        id,
      );
    await this.assertAccess();
    return {
      id,
      payload,
      sender: structuredClone(sender) as Postbox,
      recipient: structuredClone(recipient) as Postbox,
    };
  }
}
