// Separate protocol/codec: V4 has eleven positional fields; V3 has nine.
// No current deployment selects this client. Evidence is an activation interlock,
// not a substitute for checking the on-chain template and owner rules.
import {
  Network,
  TransactionBuilder,
  stringLiteral,
  getVaultIdsForAccount,
} from "@tari-project/ootle";
import { IndexerProvider } from "@tari-project/ootle-indexer";
import type { Context, Deployment, Postbox, MailboxKey } from "./types";
import {
  decodeOffice,
  decodeEnvelope,
  decodeMailboxState,
  taggedAddress,
} from "./chain";
import { endpoint } from "./config";
import { emptyDeployment } from "./config";
import { hex } from "./crypto";
import { mailboxKey } from "./mailbox";
import { verifyPermanentCarrier } from "./sapient-capsule";
import { money } from "./transactions";
import { hasUnresolved } from "./pending";
import { SapientSession, type SapientPostage } from "./sapient";
import { readWithTimeout } from "./read-timeout";
import {
  parseSealedMail,
  type SealedMail,
  type SealedMailEntry,
} from "./sealed-mail";

export interface SealedOfficeProfile extends Context {
  protocol: "moonmail-sealed-1";
  indexerUrl: string;
  resource: string;
  recoveryResource: string;
  evidence: {
    engine: boolean;
    recovery: boolean;
    stockSapient: boolean;
    sentAndReplies: boolean;
    nativePrivatePostage: boolean;
  };
}
export interface SealedPostbox extends Postbox {
  keyHistory: MailboxKey[];
}
const evidenceFields = [
  "engine",
  "recovery",
  "stockSapient",
  "sentAndReplies",
  "nativePrivatePostage",
] as const;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid sealed office state");
  return value as Record<string, unknown>;
}
function fields(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid sealed office encoding");
  return value;
}
function absent(value: unknown) {
  return value == null || (Array.isArray(value) && value.length === 0);
}
function publicKey(value: unknown) {
  const key =
    typeof value === "string"
      ? value
      : Array.isArray(value) &&
          value.length === 32 &&
          value.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)
        ? hex(Uint8Array.from(value))
        : value && typeof value === "object" && "hex" in value
          ? (value as { hex: unknown }).hex
          : undefined;
  if (
    typeof key !== "string" ||
    !/^[a-f0-9]{64}$/.test(key) ||
    /^0+$/.test(key)
  )
    throw new Error("Invalid sealed transaction signer");
  return key;
}
function directory(value: unknown) {
  const object = record(value);
  const values =
    object["@cbor"] === "map"
      ? fields(object.entries).map((value) => {
          const pair = fields(value);
          if (pair.length !== 2)
            throw new Error("Invalid sealed directory pair");
          return pair;
        })
      : Object.entries(object);
  const seen = new Set<string>();
  return values.map(([id, address]) => {
    if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id) || seen.has(id))
      throw new Error("Invalid or duplicate sealed directory ID");
    seen.add(id);
    return { id, component: taggedAddress(address, "component") };
  });
}
export function sealedOfficeProfile(value: unknown): SealedOfficeProfile {
  const p = record(value),
    evidence = record(p.evidence);
  if (
    p.protocol !== "moonmail-sealed-1" ||
    ![16, 36, 38].includes(p.network as number) ||
    typeof p.registry !== "string" ||
    !/^component_[a-f0-9]{64}$/.test(p.registry) ||
    typeof p.template !== "string" ||
    !/^[a-f0-9]{64}$/.test(p.template) ||
    typeof p.resource !== "string" ||
    !/^resource_[a-f0-9]{64}$/.test(p.resource) ||
    typeof p.recoveryResource !== "string" ||
    !/^resource_[a-f0-9]{64}$/.test(p.recoveryResource) ||
    typeof p.indexerUrl !== "string" ||
    evidenceFields.some((k) => typeof evidence[k] !== "boolean")
  )
    throw new Error("Invalid sealed office profile");
  endpoint(p.indexerUrl, p.network === 16);
  return structuredClone(value) as SealedOfficeProfile;
}
function legacyProfile(p: SealedOfficeProfile): Deployment {
  return {
    ...emptyDeployment,
    ...p,
    contractProtocol: "unified-1",
    postboxClaimProtocol: "sapient-proof-1",
    envelopeTemplate: p.template,
    capsule: {
      template: p.template,
      component: p.registry,
      resource: p.recoveryResource,
    },
    evidence: emptyDeployment.evidence,
  };
}
function legacyFields(a: unknown[]) {
  return [...a.slice(0, 5), a[7], a[8], a[9], a[10]];
}
export function decodeSealedOffice(
  state: unknown,
  profile: SealedOfficeProfile,
) {
  const a = fields(state);
  if (a.length !== 11 || a[7] !== 0 || !absent(a[6]))
    throw new Error("Invalid V4 post office root");
  const base = decodeOffice(legacyFields(a), legacyProfile(profile)),
    sealedRefs = directory(a[5]);
  const postboxMap = record(a[2]);
  const rawPostboxes =
    postboxMap["@cbor"] === "map"
      ? fields(postboxMap.entries).map((value) => fields(value))
      : Object.entries(postboxMap);
  const postboxes: SealedPostbox[] = base.postboxes.map((box) => {
    const row = fields(rawPostboxes.find(([id]) => id === box.id)?.[1]);
    if (row.length !== 6 || !Array.isArray(row[5]) || row[5].length > 15)
      throw new Error("Missing bounded V4 mailbox key history");
    const current = mailboxKey(box.encryptionKey),
      keyHistory = row[5].map((value) => {
        if (typeof value !== "string")
          throw new Error("Invalid historical mailbox key");
        return mailboxKey(value);
      });
    const versions = [...keyHistory, current];
    if (
      versions.some(
        (key, index) =>
          key.keyVersion !== index + 1 ||
          key.recovery !== "sapient-capsule-1" ||
          key.capsule?.resource !== profile.recoveryResource,
      ) ||
      new Set(versions.map((k) => k.publicKey)).size !== versions.length ||
      new Set(versions.map((k) => k.capsule!.commitment)).size !==
        versions.length
    )
      throw new Error("Incomplete or ambiguous mailbox key history");
    return { ...box, keyHistory };
  });
  if (
    sealedRefs.length + base.letterRefs.length > 4096 ||
    sealedRefs.some((r) => base.letterRefs.some((l) => l.id === r.id))
  )
    throw new Error("Invalid combined letter directory");
  return { ...base, postboxes, sealedRefs };
}
function sealedChild(
  state: unknown,
  profile: SealedOfficeProfile,
  kind: number,
) {
  const a = fields(state);
  if (
    a.length < 8 ||
    a.length > 11 ||
    a[0] !== profile.network ||
    a[7] !== kind ||
    taggedAddress(a[3], "template") !== `template_${profile.template}` ||
    directory(a[5]).length
  )
    throw new Error("Invalid V4 letter component");
  return a;
}
export function decodeSealedLetter(
  state: unknown,
  profile: SealedOfficeProfile,
  id: string,
  component: string,
): SealedMailEntry & { component: string } {
  const a = sealedChild(state, profile, 3),
    d = legacyFields(a);
  // The shared V3 root codec also verifies all three empty directories/resource.
  // A sealed child has no legacy envelope/mailbox/recovery-resource payload.
  if (![a[8], a[9], a[10]].every(absent))
    throw new Error("Mixed sealed component state");
  d[5] = 0;
  d[8] = profile.recoveryResource;
  const empty = decodeOffice(d, legacyProfile(profile));
  if (
    empty.letterRefs.length ||
    empty.postboxes.length ||
    empty.mailboxRefs.length
  )
    throw new Error("Sealed child carries registry data");
  const letter = fields(a[6]);
  if (
    letter.length !== 5 ||
    letter[0] !== id ||
    letter[1] !== profile.network ||
    taggedAddress(letter[2], "component") !== profile.registry ||
    typeof letter[3] !== "string" ||
    new TextEncoder().encode(letter[3]).length > 24000 ||
    !/^component_[a-f0-9]{64}$/.test(component)
  )
    throw new Error("Sealed letter identity mismatch");
  return {
    id,
    component,
    senderPublicKey: publicKey(letter[4]),
    payload: parseSealedMail(JSON.parse(letter[3])),
  };
}
export function decodeV4LegacyLetter(
  state: unknown,
  profile: SealedOfficeProfile,
  id: string,
  component: string,
) {
  const a = sealedChild(state, profile, 1);
  if (!absent(a[6])) throw new Error("Mixed V4 envelope state");
  return decodeEnvelope(legacyFields(a), legacyProfile(profile), id, component);
}
export function decodeV4Mailbox(
  state: unknown,
  profile: SealedOfficeProfile,
  box: Postbox,
) {
  const a = sealedChild(state, profile, 2);
  if (!absent(a[6])) throw new Error("Mixed V4 mailbox state");
  return decodeMailboxState(legacyFields(a), legacyProfile(profile), box);
}
export function sealedWritesReady(
  profile: SealedOfficeProfile,
  postage: SapientPostage = "private",
) {
  return (
    profile.protocol === "moonmail-sealed-1" &&
    evidenceFields
      .filter((k) => k !== "nativePrivatePostage")
      .every((k) => profile.evidence[k] === true) &&
    (postage === "transparent" ||
      (postage === "private" && profile.evidence.nativePrivatePostage === true))
  );
}
export function sealedPublishTransaction(
  profile: SealedOfficeProfile,
  id: string,
  payload: SealedMail,
  account: string,
  fee: string,
  epoch: number,
) {
  if (
    !/^[a-f0-9]{64}$/.test(id) ||
    !/^component_[a-f0-9]{64}$/.test(account) ||
    !Number.isSafeInteger(epoch) ||
    epoch < 0 ||
    !Number.isSafeInteger(epoch + 9) ||
    money(fee) <= 0n
  )
    throw new Error("Invalid sealed transaction review");
  const prepared = parseSealedMail(payload);
  return TransactionBuilder.new(profile.network as Network, epoch + 9)
    .feeTransactionPayFromComponent(account, money(fee))
    .withInputs([
      {
        substate_id: `template_${profile.template}`,
        version: null,
        is_write: false,
      },
    ])
    .callMethod(
      { componentAddress: profile.registry, methodName: "publish_sealed" },
      [stringLiteral(id), stringLiteral(JSON.stringify(prepared))],
    )
    .buildUnsignedTransaction();
}
function component(value: unknown, template: string) {
  const c = record(record(record(value).substate).Component),
    header = record(c.header);
  if (
    typeof header.template_address !== "string" ||
    header.template_address.replace(/^template_/, "") !== template ||
    header.owner_rule !== "None"
  )
    throw new Error("Untrusted sealed template or owner rule");
  return record(c.body).state;
}
export class SealedOfficeClient {
  readonly profile: SealedOfficeProfile;
  private constructor(
    profile: SealedOfficeProfile,
    readonly provider: IndexerProvider,
  ) {
    this.profile = sealedOfficeProfile(profile);
  }
  static async connect(profile: SealedOfficeProfile) {
    const p = sealedOfficeProfile(profile);
    return new SealedOfficeClient(
      p,
      await readWithTimeout(
        IndexerProvider.connect({
          url: endpoint(p.indexerUrl, p.network === 16),
          network: p.network as Network,
        }),
      ),
    );
  }
  async readOffice() {
    return decodeSealedOffice(
      component(
        await readWithTimeout(this.provider.getSubstate(this.profile.registry)),
        this.profile.template,
      ),
      this.profile,
    );
  }
  private async child(id: string) {
    return component(
      await readWithTimeout(this.provider.getSubstate(id)),
      this.profile.template,
    );
  }
  async readPage(
    after = "",
    limit = 50,
    options: { allowPartial?: boolean; signal?: AbortSignal } = {},
  ) {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (after !== "" && !/^[a-f0-9]{64}$/.test(after))
    )
      throw new Error(
        "Sealed pages require a canonical cursor and limit 1..50",
      );
    options.signal?.throwIfAborted();
    const office = await this.readOffice(),
      refs = office.sealedRefs
        .sort((a, b) => a.id.localeCompare(b.id))
        .filter((r) => r.id > after)
        .slice(0, limit),
      entries: (SealedMailEntry & { component: string })[] = [],
      unavailableIds: string[] = [];
    for (let i = 0; i < refs.length; i += 8) {
      options.signal?.throwIfAborted();
      const batch = refs.slice(i, i + 8),
        results = await Promise.allSettled(
          batch.map(async (ref) =>
            decodeSealedLetter(
              await this.child(ref.component),
              this.profile,
              ref.id,
              ref.component,
            ),
          ),
        );
      options.signal?.throwIfAborted();
      results.forEach((r, index) => {
        if (r.status === "fulfilled") entries.push(r.value);
        else if (options.allowPartial) unavailableIds.push(batch[index].id);
        else throw r.reason;
      });
    }
    return {
      entries,
      unavailableIds,
      postboxes: office.postboxes,
      total: office.sealedRefs.length,
      nextCursor: refs.length === limit ? refs.at(-1)!.id : "",
    };
  }
  async readLetter(id: string) {
    const office = await this.readOffice(),
      ref = office.sealedRefs.find((r) => r.id === id);
    if (!ref) throw new Error("Unknown sealed letter");
    return decodeSealedLetter(
      await this.child(ref.component),
      this.profile,
      id,
      ref.component,
    );
  }
  async publish(
    wallet: SapientSession,
    review: {
      id: string;
      payload: SealedMail;
      sender: Postbox;
      recipient: Postbox;
    },
    fee: string,
    storage: Storage,
    postage: SapientPostage = "private",
  ) {
    if (
      !(wallet instanceof SapientSession) ||
      !sealedWritesReady(this.profile, postage)
    )
      throw new Error(
        "Sealed sending is disabled until deployment and stock-wallet recovery are verified",
      );
    review = structuredClone(review);
    const account = { ...wallet.accounts[0].account };
    if (
      wallet.network !== this.profile.network ||
      account.owner_public_key !== review.sender.controller
    )
      throw new Error("Choose your connected Sapient sending postbox");
    const payload = parseSealedMail(review.payload),
      office = await this.readOffice();
    if (
      office.sealedRefs.some((r) => r.id === review.id) ||
      office.letterRefs.some((r) => r.id === review.id) ||
      hasUnresolved(
        storage,
        this.profile.network,
        this.profile.registry,
        review.id,
      )
    )
      throw new Error("Reconcile the existing sealed publication first");
    for (const expected of [review.sender, review.recipient]) {
      const actual = office.postboxes.find((p) => p.id === expected.id),
        key = mailboxKey(expected.encryptionKey);
      if (
        !actual ||
        actual.controller !== expected.controller ||
        JSON.stringify(mailboxKey(actual.encryptionKey)) !==
          JSON.stringify(key) ||
        key.recovery !== "sapient-capsule-1"
      )
        throw new Error("Postbox key or controller changed; review again");
      await verifyPermanentCarrier(key.capsule!, (id) =>
        this.provider.getSubstate(id),
      );
    }
    const tx = sealedPublishTransaction(
      this.profile,
      review.id,
      payload,
      account.component_address,
      fee,
      await readWithTimeout(this.provider.getCurrentEpoch()),
    );
    // No gift withdrawal. Declare account vaults for transparent fees; stock
    // Sapient supplies private fee dependencies itself. Never provide routing keys.
    const nativeResource = `resource_${"01".repeat(32)}`;
    const dependencies = [
      this.profile.registry,
      account.component_address,
      ...(postage === "transparent"
        ? [
            nativeResource,
            ...(await readWithTimeout(
              getVaultIdsForAccount(this.provider, account.component_address),
            )),
          ]
        : []),
    ];
    tx.inputs.push(
      ...dependencies.map((substate_id) => ({
        substate_id,
        version: null,
        is_write: substate_id !== nativeResource,
      })),
    );
    tx.inputs = await readWithTimeout(this.provider.resolveInputs(tx.inputs));
    return wallet.submitOperation(
      tx,
      fee,
      storage,
      {
        network: this.profile.network,
        registry: this.profile.registry,
        envelopeId: review.id,
        operation: "publish",
      },
      postage,
    );
  }
}
