import { IndexerProvider } from "@tari-project/ootle-indexer";
import { Network } from "@tari-project/ootle";
import {
  resolveTransaction,
  signTransaction,
  sealTransaction,
  classifyOutcome,
  getVaultIdsForAccount,
} from "@tari-project/ootle";
import {
  EphemeralKeySigner,
  SecretKeyWallet,
} from "@tari-project/ootle-secret-key-wallet";
import { parseOotleAddress } from "@tari-project/ootle-wasm";
import type { Deployment, Envelope, Postbox, MailboxContext } from "./types";
import type { ConnectedWallet, WalletAccount } from "./wallet";
import { SapientSession } from "./sapient";
import {
  claimsReady,
  writesReady,
  postboxClaimsReady,
  endpoint,
} from "./config";
import { postboxProofClaimTransaction } from "./postbox-claim";
import { hex } from "./crypto";
import {
  claimTransaction,
  claimToNewAccountTransaction,
  publishTransaction,
  postboxTransaction,
} from "./transactions";
import { mailboxKey } from "./mailbox";
import {
  beginSubmission,
  completeSubmission,
  hasUnresolved,
  readPending,
  capsuleIdentity,
} from "./pending";
// Strict codec for positional minicbor component state, not an invented RPC.
function arr(v: unknown): unknown[] {
  if (!Array.isArray(v))
    throw new Error("Unsupported component state encoding");
  return v;
}
function map(v: unknown): [string, unknown][] {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (o["@cbor"] === "map")
      return arr(o.entries).map((e) => {
        const a = arr(e);
        return [String(a[0]), a[1]];
      });
    return Object.entries(o);
  }
  throw new Error("Unsupported registry map");
}
function text(v: unknown): string {
  if (typeof v !== "string") throw new Error("Invalid text in state");
  return v;
}
function bytes(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return hex(Uint8Array.from(v as number[]));
  if (v && typeof v === "object" && "hex" in v) return text(v.hex);
  throw new Error("Invalid public key");
}
function amount(v: unknown): string {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0)
    return String(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return v;
  if (v && typeof v === "object" && "value" in v) return amount(v.value);
  throw new Error("Unrepresentable amount");
}
export function taggedAddress(v: unknown, prefix: string): string {
  if (typeof v === "string" && new RegExp(`^${prefix}_[a-f0-9]{64}$`).test(v))
    return v;
  if (v && typeof v === "object" && "value" in v)
    return `${prefix}_${bytes(v.value)}`;
  if (prefix === "template") return `template_${bytes(v)}`;
  throw new Error("Invalid address encoding");
}
export function decodeEnvelope(
  state: unknown,
  d: Deployment,
  id: string,
  component: string,
): Envelope {
  const raw = arr(state);
  if (raw[0] !== d.network) throw new Error("Envelope network mismatch");
  const e = raw.slice(1);
  if (
    d.postboxClaimProtocol === "sapient-proof-1" &&
    taggedAddress(raw[14], "component") !== d.registry
  )
    throw new Error("Proof envelope registry mismatch");
  if (text(e[0]) !== id || ![0, 1, 2].includes(Number(e[1])))
    throw new Error("Envelope identity mismatch");
  const mode = (["public", "link", "postbox"] as const)[Number(e[1])];
  const payload = JSON.parse(text(e[2]));
  if (typeof e[5] !== "boolean") throw new Error("Invalid claimed state");
  if (mode === "link" && payload.claimPublicKey !== bytes(e[6]))
    throw new Error("Stored claim authority mismatch");
  if (
    mode === "public" &&
    (typeof payload.subject !== "string" || typeof payload.body !== "string")
  )
    throw new Error("Invalid public letter");
  if (mode === "postbox") {
    if (
      !payload ||
      payload.version !== "gd-postbox-1" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(text(e[7])) ||
      !/^[a-f0-9]{64}$/.test(bytes(e[6]))
    )
      throw new Error("Invalid addressed envelope");
    mailboxKey({
      version: payload.version,
      keyVersion: payload.keyVersion,
      publicKey: payload.recipientKey,
      recovery: payload.recovery,
      capsule: payload.capsule,
    });
  }
  return {
    claimProtocol: d.postboxClaimProtocol,
    component,
    id,
    mode,
    context: { network: d.network, registry: d.registry, template: d.template },
    payload,
    gift: amount(e[3]),
    reserve: amount(e[4]),
    claimed: e[5],
    recipientPostbox: text(e[7]),
    claimAuthority: mode === "public" ? undefined : bytes(e[6]),
    replyPostbox: text(e[8]),
    sender: bytes(e[9]),
    campaign: text(e[10]),
  };
}
export function decodeOffice(state: unknown, d: Deployment) {
  const a = arr(state);
  if (a[0] !== d.network) throw new Error("Registry network mismatch");
  if (
    taggedAddress(a[3], "template").replace("template_", "") !==
    d.envelopeTemplate
  )
    throw new Error("Wrong envelope template");
  const letterRefs = map(a[1]).map(([id, value]) => ({
    id,
    component: taggedAddress(value, "component"),
  }));
  const postboxes: Postbox[] = map(a[2]).map(([id, value]) => {
    const p = arr(value);
    if (text(p[0]) !== id) throw new Error("Postbox identity mismatch");
    return {
      id,
      nickname: text(p[1]),
      controller: bytes(p[2]),
      encryptionKey: text(p[3]),
      discoverable: p[4] === true,
    };
  });
  return { letterRefs, postboxes };
}
export class PostOfficeClient {
  private constructor(
    readonly deployment: Deployment,
    readonly provider: IndexerProvider,
  ) {}
  static async connect(d: Deployment) {
    if (!d.registry || !d.template)
      throw new Error("No deployed post office configured");
    return new PostOfficeClient(
      d,
      await IndexerProvider.connect({
        url: endpoint(d.indexerUrl, d.network === 16),
        network: d.network as Network,
      }),
    );
  }
  async read(
    after = "",
    limit = 100,
    options: { allowPartial?: boolean } = {},
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error("Page size must be an integer from 1 to 100");
    const r = await this.provider.getSubstate(this.deployment.registry);
    const v = r.substate as unknown as {
      Component?: {
        header: { template_address: string; owner_rule: unknown };
        body: { state: unknown };
      };
    };
    if (
      !v.Component ||
      v.Component.header.template_address.replace(/^template_/, "") !==
        this.deployment.template ||
      v.Component.header.owner_rule !== "None"
    )
      throw new Error("Untrusted registry template or owner rule");
    const office = decodeOffice(v.Component.body.state, this.deployment);
    const refs = office.letterRefs
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .filter((r) => r.id > after)
        .slice(0, limit),
      letters: Envelope[] = [];
    const unavailableLetterIds: string[] = [];
    for (let i = 0; i < refs.length; i += 8) {
      const batch = refs.slice(i, i + 8);
      const results = await Promise.allSettled(
        batch.map((ref) => this.readLetter(ref.id, ref.component)),
      );
      results.forEach((result, index) => {
        if (result.status === "fulfilled") letters.push(result.value);
        else if (options.allowPartial)
          unavailableLetterIds.push(batch[index].id);
        else throw result.reason;
      });
    }
    return {
      letters,
      unavailableLetterIds,
      postboxes: office.postboxes,
      total: office.letterRefs.length,
      nextCursor: refs.length === limit ? refs.at(-1)!.id : "",
    };
  }
  async readLetter(id: string, component?: string): Promise<Envelope> {
    if (!component) {
      const r = await this.provider.getSubstate(this.deployment.registry);
      const c = (
        r.substate as unknown as { Component: { body: { state: unknown } } }
      ).Component;
      component = decodeOffice(c.body.state, this.deployment).letterRefs.find(
        (r) => r.id === id,
      )?.component;
      if (!component) throw new Error("Unknown envelope");
    }
    const r = await this.provider.getSubstate(component);
    const c = (
      r.substate as unknown as {
        Component?: {
          header: { template_address: string; owner_rule: unknown };
          body: { state: unknown };
        };
      }
    ).Component;
    if (
      !c ||
      c.header.template_address.replace(/^template_/, "") !==
        this.deployment.envelopeTemplate ||
      c.header.owner_rule !== "None"
    )
      throw new Error("Untrusted envelope template or owner rule");
    return decodeEnvelope(c.body.state, this.deployment, id, component);
  }
  async validateDestination(address: string, component: string) {
    const parsed = parseOotleAddress(address);
    try {
      if (parsed.network !== this.deployment.network || parsed.memo?.length)
        throw new Error("Wrong network or unsupported memo address");
      if (!/^component_[a-f0-9]{64}$/.test(component))
        throw new Error(
          "Enter the receiving account component as well as its Ootle address",
        );
      const r = await this.provider.getSubstate(component);
      const v = r.substate as unknown as {
        Component?: {
          header: {
            owner_rule: { ByPublicKey?: unknown };
            template_address: string;
          };
        };
      };
      if (
        !v.Component ||
        bytes(v.Component.header.owner_rule.ByPublicKey) !==
          hex(parsed.owner_key)
      )
        throw new Error("Receiving address does not control this account");
      // Built-in Account identity is additionally checked by the template, before fee payment.
      return component;
    } finally {
      parsed.free();
    }
  }
  async publish(
    wallet: ConnectedWallet,
    account: WalletAccount,
    envelope: Envelope,
    fee: string,
    storage: Storage,
  ) {
    if (
      wallet instanceof SapientSession &&
      envelope.mode === "postbox" &&
      BigInt(envelope.gift) > 0n &&
      !postboxClaimsReady(this.deployment, "sapient")
    )
      throw new Error("Addressed gifts await Sapient prepaid signing support");
    if (!writesReady(this.deployment, envelope.mode, wallet.kind ?? "daemon"))
      throw new Error("Production sending awaits deployment evidence");
    if (
      hasUnresolved(
        storage,
        this.deployment.network,
        this.deployment.registry,
        envelope.id,
      )
    )
      throw new Error("Reconcile the existing submission first");
    const tx = publishTransaction(
      this.deployment,
      envelope,
      account.account.component_address,
      fee,
      await this.provider.getCurrentEpoch(),
    );
    if (wallet instanceof SapientSession) {
      if (
        wallet.network !== this.deployment.network ||
        wallet.accounts[0].account.component_address !==
          account.account.component_address
      )
        throw new Error("Choose the connected Sapient funding account");
      // Sapient may broadcast again while discovering missing inputs. Declare the
      // known component/resource/vault dependencies before its first simulation.
      const fundingInputs = [
        this.deployment.registry,
        account.account.component_address,
        this.deployment.resource,
        ...(await getVaultIdsForAccount(
          this.provider,
          account.account.component_address,
        )),
      ].map((substate_id) => ({
        substate_id,
        version: null,
        is_write: substate_id !== this.deployment.resource,
      }));
      tx.inputs = Array.from(
        new Map(
          [...tx.inputs, ...fundingInputs].map((input) => [
            input.substate_id,
            input,
          ]),
        ).values(),
      );
      tx.inputs = await this.provider.resolveInputs(tx.inputs);
      return wallet.submitOperation(tx, fee, storage, {
        network: this.deployment.network,
        registry: this.deployment.registry,
        operation: "publish",
        envelopeId: envelope.id,
      });
    }
    if (!account.account.owner_key_id)
      throw new Error("Account has no signing key");
    const request = {
      transaction: { V1: tx },
      seal_signer: account.account.owner_key_id,
      // The seal alone is not an authorization signature. Sign as the account too.
      other_signers: [account.account.owner_key_id],
      signatures: [],
      detect_inputs: true,
      detect_inputs_use_unversioned: true,
      lock_ids: [],
    };
    const dry = await wallet.submitDryRun(request);
    if (BigInt(dry.required_fees) > BigInt(fee))
      throw new Error("Creation fee cap is too low");
    if (!("Accept" in dry.result.finalize.result))
      throw new Error(
        "Publication dry run rejected; no transaction was submitted",
      );
    const attempt = beginSubmission(storage, {
      network: this.deployment.network,
      registry: this.deployment.registry,
      operation: "publish",
      envelopeId: envelope.id,
    });
    const r = await wallet.submit(request);
    completeSubmission(storage, attempt, r.transaction_id);
    return r.transaction_id;
  }
  async claim(
    envelope: Envelope,
    address: string,
    component: string,
    claimSecret: Uint8Array | undefined,
    storage: Storage,
    createAccount = false,
  ) {
    if (
      envelope.context.network !== this.deployment.network ||
      envelope.context.registry !== this.deployment.registry ||
      envelope.context.template !== this.deployment.template
    )
      throw new Error("Envelope belongs to another deployment");
    if (!claimsReady(this.deployment, createAccount))
      throw new Error("Guest claiming awaits engine and delivery evidence");
    if (envelope.mode === "postbox")
      throw new Error(
        "Addressed claims require the controlling wallet and the postbox claim route",
      );
    if (envelope.claimed || BigInt(envelope.gift) === 0n)
      throw new Error("Gift is unavailable");
    if (envelope.mode === "link" && !claimSecret)
      throw new Error("Private link required");
    if (
      hasUnresolved(
        storage,
        this.deployment.network,
        this.deployment.registry,
        envelope.id,
      )
    )
      throw new Error("Reconcile the existing submission first");
    let ownerPublicKey = "";
    const destination = createAccount
      ? ""
      : await this.validateDestination(address, component);
    if (createAccount) {
      const parsed = parseOotleAddress(address);
      try {
        if (parsed.network !== this.deployment.network || parsed.memo?.length)
          throw new Error("Wrong network or unsupported memo address");
        ownerPublicKey = hex(parsed.owner_key);
      } finally {
        parsed.free();
      }
    }
    if (!envelope.component) throw new Error("Envelope component missing");
    const latest = await this.readLetter(envelope.id, envelope.component);
    if (latest.claimed) throw new Error("Gift already collected");
    const epoch = await this.provider.getCurrentEpoch();
    const rawTx = createAccount
      ? claimToNewAccountTransaction(
          this.deployment,
          envelope.component,
          ownerPublicKey,
          epoch,
        )
      : claimTransaction(
          this.deployment,
          envelope.component,
          destination,
          epoch,
        );
    const vaults = [
      ...(await getVaultIdsForAccount(this.provider, envelope.component)),
      ...(createAccount
        ? []
        : await getVaultIdsForAccount(this.provider, destination)),
    ];
    const ids = [
      envelope.component,
      ...(createAccount ? [] : [destination]),
      this.deployment.resource,
      `template_${this.deployment.envelopeTemplate}`,
      ...vaults,
    ];
    rawTx.inputs = Array.from(new Set(ids)).map((substate_id) => ({
      substate_id,
      version: null,
      is_write:
        substate_id !== this.deployment.resource &&
        !substate_id.startsWith("template_"),
    }));
    const tx = await resolveTransaction(this.provider, rawTx);
    const signer = claimSecret
      ? SecretKeyWallet.fromSecretKey(
          claimSecret,
          this.deployment.network as Network,
        )
      : EphemeralKeySigner.generate(this.deployment.network as Network);
    const signed = await signTransaction([signer], tx);
    const attempt = beginSubmission(storage, {
      network: this.deployment.network,
      registry: this.deployment.registry,
      operation: "claim",
      envelopeId: envelope.id,
    });
    const r = await this.provider.submitTransaction(sealTransaction(signed));
    completeSubmission(storage, attempt, r.transaction_id);
    return r.transaction_id;
  }
  private async submitControlled(
    wallet: ConnectedWallet,
    account: WalletAccount,
    tx: ReturnType<typeof publishTransaction>,
    feeCap: string,
    storage: Storage,
    operation: "postbox" | "claim",
    identity: string,
  ) {
    if (wallet instanceof SapientSession) {
      if (
        wallet.network !== this.deployment.network ||
        wallet.accounts[0].account.component_address !==
          account.account.component_address
      )
        throw new Error("Wrong Sapient account or network");
      if (
        hasUnresolved(
          storage,
          this.deployment.network,
          this.deployment.registry,
          identity,
        )
      )
        throw new Error("Resume the existing submission first");
      const ids = [
        this.deployment.registry,
        account.account.component_address,
        this.deployment.resource,
        `template_${this.deployment.template}`,
        ...(await getVaultIdsForAccount(
          this.provider,
          account.account.component_address,
        )),
      ];
      tx.inputs = Array.from(
        new Map(
          [
            ...tx.inputs,
            ...ids.map((substate_id) => ({
              substate_id,
              version: null,
              is_write:
                substate_id !== this.deployment.resource &&
                !substate_id.startsWith("template_"),
            })),
          ].map((input) => [input.substate_id, input]),
        ).values(),
      );
      tx.inputs = await this.provider.resolveInputs(tx.inputs);
      return wallet.submitOperation(tx, feeCap, storage, {
        network: this.deployment.network,
        registry: this.deployment.registry,
        operation,
        envelopeId: identity,
      });
    }
    if (!account.account.owner_key_id)
      throw new Error("Controlling account has no signing key");
    if (wallet.network !== this.deployment.network)
      throw new Error("Wrong wallet network");
    if (
      hasUnresolved(
        storage,
        this.deployment.network,
        this.deployment.registry,
        identity,
      )
    )
      throw new Error("Reconcile the existing submission first");
    const request = {
      transaction: { V1: tx },
      seal_signer: account.account.owner_key_id,
      other_signers: [account.account.owner_key_id],
      signatures: [],
      detect_inputs: true,
      detect_inputs_use_unversioned: true,
      lock_ids: [],
    };
    const dry = await wallet.submitDryRun(request);
    if (!("Accept" in dry.result.finalize.result))
      throw new Error("Wallet dry run rejected; nothing submitted");
    if (BigInt(dry.required_fees) > BigInt(feeCap))
      throw new Error("Fee cap is too low");
    const attempt = beginSubmission(storage, {
      network: this.deployment.network,
      registry: this.deployment.registry,
      operation,
      envelopeId: identity,
    });
    const result = await wallet.submit(request);
    completeSubmission(storage, attempt, result.transaction_id);
    return result.transaction_id;
  }
  async savePostbox(
    wallet: ConnectedWallet,
    account: WalletAccount,
    box: Postbox,
    operation: "create" | "edit" | "rotate",
    fee: string,
    storage: Storage,
  ) {
    if (!writesReady(this.deployment, "postbox", wallet.kind ?? "daemon"))
      throw new Error("Postbox writes await deployment and recovery evidence");
    if (box.controller !== account.account.owner_public_key)
      throw new Error("Choose the controlling account");
    if (operation !== "edit") {
      const descriptor = mailboxKey(box.encryptionKey);
      if (
        descriptor.recovery !==
        (wallet instanceof SapientSession
          ? "sapient-capsule-1"
          : "native-memo-1")
      )
        throw new Error(
          "New postbox keys require a supported permanent recovery capsule",
        );
      const context = {
        network: this.deployment.network,
        registry: this.deployment.registry,
        template: this.deployment.template,
        postbox: box.id,
        controller: box.controller,
        keyVersion: descriptor.keyVersion,
      };
      const identity = capsuleIdentity(context);
      if (hasUnresolved(storage, context.network, context.registry, identity))
        throw new Error(
          "Confirm the recovery transaction before publishing the postbox key",
        );
      const confirmed = readPending(storage).some(
        (p) =>
          p.operation === "capsule" &&
          p.state === "confirmed" &&
          p.network === context.network &&
          p.registry === context.registry &&
          p.envelopeId === identity &&
          p.capsule?.account === account.account.component_address &&
          p.capsule.context.template === context.template &&
          p.capsule.context.controller === context.controller &&
          p.capsule.descriptor.publicKey === descriptor.publicKey &&
          (descriptor.recovery !== "sapient-capsule-1" ||
            (p.capsule.descriptor.capsule?.resource ===
              descriptor.capsule?.resource &&
              p.capsule.descriptor.capsule?.commitment ===
                descriptor.capsule?.commitment &&
              p.capsule.deployment?.template ===
                this.deployment.capsule?.template &&
              p.capsule.deployment?.component ===
                this.deployment.capsule?.component &&
              p.capsule.deployment?.resource ===
                this.deployment.capsule?.resource)),
      );
      if (!confirmed)
        throw new Error(
          "Resume a confirmed recovery setup before publishing this key",
        );
      // Re-read the actual native output; a local journal alone is not key-recovery proof.
      const recovery =
        wallet instanceof SapientSession
          ? wallet.capsuleMailbox((id) => this.provider.getSubstate(id))
          : wallet.nativeMailbox();
      const secret = await recovery.recover(
        account.account.component_address,
        context,
        descriptor,
      );
      secret.fill(0);
    }
    const tx = postboxTransaction(
      this.deployment,
      account.account.component_address,
      fee,
      await this.provider.getCurrentEpoch(),
      operation,
      box,
    );
    return this.submitControlled(
      wallet,
      account,
      tx,
      fee,
      storage,
      "postbox",
      `postbox:${box.id}`,
    );
  }
  async storeSapientCapsule(
    wallet: SapientSession,
    context: MailboxContext,
    feeCap: string,
    storage: Storage,
  ) {
    if (
      !writesReady(this.deployment, "postbox", "sapient") ||
      !this.deployment.capsule
    )
      throw new Error(
        "Postbox writes await capsule deployment and recovery evidence",
      );
    if (
      context.network !== this.deployment.network ||
      context.registry !== this.deployment.registry ||
      context.template !== this.deployment.template
    )
      throw new Error("Wrong postbox deployment");
    return wallet.storeCapsule(
      context,
      this.deployment.capsule,
      feeCap,
      storage,
      {
        readSubstate: (id) => this.provider.getSubstate(id),
        vaults: (account) => getVaultIdsForAccount(this.provider, account),
        epoch: () => this.provider.getCurrentEpoch(),
        resolveInputs: (inputs) => this.provider.resolveInputs(inputs),
      },
    );
  }
  async claimPostbox(
    wallet: ConnectedWallet,
    account: WalletAccount,
    envelope: Envelope,
    address: string,
    component: string,
    storage: Storage,
  ) {
    if (wallet instanceof SapientSession) {
      if (!postboxClaimsReady(this.deployment, "sapient"))
        throw new Error(
          "Sapient cannot yet authorize the prepaid addressed gift checkpoint for this deployment",
        );
      return this.claimPostboxProof(
        wallet,
        account,
        envelope,
        address,
        component,
        storage,
      );
    }
    if (!writesReady(this.deployment, "postbox", wallet.kind ?? "daemon"))
      throw new Error("Postbox claims await deployment and recovery evidence");
    if (
      envelope.mode !== "postbox" ||
      envelope.claimed ||
      BigInt(envelope.gift) === 0n
    )
      throw new Error("Addressed gift unavailable");
    if (
      envelope.context.network !== this.deployment.network ||
      envelope.context.registry !== this.deployment.registry ||
      envelope.context.template !== this.deployment.template
    )
      throw new Error("Wrong envelope deployment");
    const latest = await this.readLetter(envelope.id, envelope.component);
    if (
      latest.claimed ||
      latest.claimAuthority !== account.account.owner_public_key ||
      !latest.component
    )
      throw new Error("Choose the wallet account controlling this gift");
    const destination = await this.validateDestination(address, component);
    const tx = claimTransaction(
      this.deployment,
      latest.component,
      destination,
      await this.provider.getCurrentEpoch(),
    );
    return this.submitControlled(
      wallet,
      account,
      tx,
      latest.reserve,
      storage,
      "claim",
      latest.id,
    );
  }
  async reconcile(id: string) {
    const r = await this.provider.getTransactionResult(id);
    return classifyOutcome(r.result);
  }
  private async claimPostboxProof(
    wallet: SapientSession,
    account: WalletAccount,
    envelope: Envelope,
    address: string,
    component: string,
    storage: Storage,
  ) {
    if (
      envelope.context.network !== this.deployment.network ||
      envelope.context.registry !== this.deployment.registry ||
      envelope.context.template !== this.deployment.template ||
      envelope.mode !== "postbox" ||
      envelope.claimProtocol !== "sapient-proof-1" ||
      wallet.accounts[0].account.component_address !==
        account.account.component_address
    )
      throw new Error("Wrong proof claim deployment or wallet account");
    if (
      hasUnresolved(
        storage,
        this.deployment.network,
        this.deployment.registry,
        envelope.id,
      )
    )
      throw new Error("Reconcile the existing submission first");
    const latest = await this.readLetter(envelope.id, envelope.component);
    if (
      latest.claimed ||
      latest.claimProtocol !== "sapient-proof-1" ||
      latest.claimAuthority !== account.account.owner_public_key ||
      !latest.component ||
      BigInt(latest.gift) <= 0n
    )
      throw new Error(
        "Choose the Sapient wallet controlling this available gift",
      );
    const destination = await this.validateDestination(address, component);
    const epoch = await this.provider.getCurrentEpoch();
    if (
      !Number.isSafeInteger(epoch) ||
      epoch < 0 ||
      epoch > Number.MAX_SAFE_INTEGER - 10
    )
      throw new Error("Invalid claim epoch");
    const expiry = epoch + 10;
    const proof = await wallet.authorizePostboxClaim(
      latest,
      destination,
      expiry,
    );
    const currentEpoch = await this.provider.getCurrentEpoch();
    const raw = postboxProofClaimTransaction(
      latest,
      destination,
      expiry,
      currentEpoch,
      proof,
    );
    const ids = [
      this.deployment.registry,
      latest.component,
      destination,
      this.deployment.resource,
      `template_${this.deployment.template}`,
      `template_${this.deployment.envelopeTemplate}`,
      ...(await getVaultIdsForAccount(this.provider, latest.component)),
      ...(await getVaultIdsForAccount(this.provider, destination)),
    ];
    raw.inputs = Array.from(new Set(ids)).map((substate_id) => ({
      substate_id,
      version: null,
      is_write:
        substate_id !== this.deployment.registry &&
        substate_id !== this.deployment.resource &&
        !substate_id.startsWith("template_"),
    }));
    const tx = await resolveTransaction(this.provider, raw);
    const signer = EphemeralKeySigner.generate(
      this.deployment.network as Network,
    );
    // Ootle 0.45 separates simulation from consensus submission. SDK 0.7's
    // sendDryRun still uses /transactions and is rejected by that endpoint.
    const dryEnvelope = sealTransaction(
      await signTransaction([signer], { ...tx, dry_run: true }),
    );
    const dry = await this.provider.getClient().getTransport().sendPost<{
      transaction_id: string;
      result: {
        finalize: {
          result: Record<string, unknown>;
          total_fees_required: string | number;
        };
      };
    }>("transactions/dry-run", { transaction: dryEnvelope });
    const execution = dry.result;
    if (!execution || !("Accept" in execution.finalize.result))
      throw new Error(
        "Proof claim simulation rejected; no claim was broadcast",
      );
    const required = execution.finalize.total_fees_required;
    if (
      (typeof required === "number" && !Number.isSafeInteger(required)) ||
      !/^(0|[1-9][0-9]*)$/.test(String(required))
    )
      throw new Error("Invalid simulation fee; no claim was broadcast");
    if (BigInt(required) > BigInt(latest.reserve))
      throw new Error(
        "The gift reserve cannot cover collection fees; no claim was broadcast",
      );
    await wallet.assertCurrent();
    if (
      hasUnresolved(
        storage,
        this.deployment.network,
        this.deployment.registry,
        envelope.id,
      )
    )
      throw new Error("Reconcile the existing submission first");
    const signed = await signTransaction([signer], tx);
    if (
      hasUnresolved(
        storage,
        this.deployment.network,
        this.deployment.registry,
        envelope.id,
      )
    )
      throw new Error("Reconcile the existing submission first");
    const attempt = beginSubmission(storage, {
      network: this.deployment.network,
      registry: this.deployment.registry,
      operation: "claim",
      envelopeId: envelope.id,
    });
    const result = await this.provider.submitTransaction(
      sealTransaction(signed),
    );
    completeSubmission(storage, attempt, result.transaction_id);
    return result.transaction_id;
  }
}
