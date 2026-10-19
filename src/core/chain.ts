import { readWithTimeout } from "./read-timeout";
import { postboxNameError } from "./postbox-name";
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
  mailboxStateReady,
  endpoint,
  unifiedOffice,
} from "./config";
import {
  SealedOfficeClient,
  sealedProfileFor,
  decodeSealedOffice,
  decodeSealedLetter,
  decodeV4LegacyLetter,
  decodeV4Mailbox,
} from "./sealed-office";
import {
  postboxProofClaimTransaction,
  postboxClaimExpiry,
} from "./postbox-claim";
import { hex } from "./crypto";
import { receivingAddress } from "./receiving-address";
import {
  claimTransaction,
  claimToNewAccountTransaction,
  publishTransaction,
  postboxTransaction,
  mailboxStateTransaction,
} from "./transactions";
import { mailboxKey } from "./mailbox";
import {
  beginSubmission,
  completeSubmission,
  hasUnresolved,
  readPending,
  capsuleIdentity,
} from "./pending";
export {
  decodeEnvelope,
  decodeOffice,
  decodeMailboxState,
  taggedAddress,
} from "./state-codecs";
import {
  decodeEnvelope,
  decodeOffice,
  decodeMailboxState,
  stateBytes as bytes,
} from "./state-codecs";
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
      await readWithTimeout(
        IndexerProvider.connect({
          url: endpoint(d.indexerUrl, d.network === 16),
          network: d.network as Network,
        }),
      ),
    );
  }
  sealedOffice() {
    return SealedOfficeClient.forProvider(this.deployment, this.provider);
  }
  private async readOffice() {
    const r = await readWithTimeout(
      this.provider.getSubstate(this.deployment.registry),
    );
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
    if (this.deployment.contractProtocol === "unified-2")
      return decodeSealedOffice(
        v.Component.body.state,
        sealedProfileFor(this.deployment),
      );
    return {
      ...decodeOffice(v.Component.body.state, this.deployment),
      sealedRefs: [] as { id: string; component: string }[],
    };
  }
  async read(
    after = "",
    limit = 100,
    options: { allowPartial?: boolean } = {},
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error("Page size must be an integer from 1 to 100");
    const office = await this.readOffice();
    const refs = [
        ...office.letterRefs.map((r) => ({ ...r, sealed: false })),
        ...office.sealedRefs.map((r) => ({ ...r, sealed: true })),
      ]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .filter((r) => r.id > after)
        .slice(0, limit),
      letters: Envelope[] = [];
    const unavailableLetterIds: string[] = [];
    for (let i = 0; i < refs.length; i += 8) {
      const batch = refs.slice(i, i + 8);
      const results = await Promise.allSettled(
        batch.map((ref) => this.readLetter(ref.id, ref.component, ref.sealed)),
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
      total: office.letterRefs.length + office.sealedRefs.length,
      nextCursor: refs.length === limit ? refs.at(-1)!.id : "",
    };
  }
  async readLetter(
    id: string,
    component?: string,
    sealed = false,
  ): Promise<Envelope> {
    if (!component) {
      const office = await this.readOffice();
      component = office.letterRefs.find((r) => r.id === id)?.component;
      if (!component) {
        component = office.sealedRefs.find((r) => r.id === id)?.component;
        sealed = !!component;
      }
      if (!component) throw new Error("Unknown envelope");
    }
    const r = await readWithTimeout(this.provider.getSubstate(component));
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
    if (this.deployment.contractProtocol === "unified-2") {
      const profile = sealedProfileFor(this.deployment);
      if (sealed) {
        const entry = decodeSealedLetter(c.body.state, profile, id, component);
        return {
          deliveryProtocol: "mm-sealed-2",
          component,
          id,
          mode: "postbox",
          context: {
            network: profile.network,
            registry: profile.registry,
            template: profile.template,
          },
          payload: entry.payload,
          gift: "0",
          reserve: "0",
          claimed: false,
          sender: entry.senderPublicKey,
        };
      }
      return decodeV4LegacyLetter(c.body.state, profile, id, component);
    }
    return decodeEnvelope(c.body.state, this.deployment, id, component);
  }
  async readMailbox(
    box: Postbox,
  ): Promise<{ revision: string; ciphertext: string; component?: string }> {
    if (!unifiedOffice(this.deployment))
      throw new Error(
        "This post office does not support saved mailbox settings",
      );
    const office = await this.readOffice();
    const registered = office.postboxes.find((p) => p.id === box.id);
    if (!registered || registered.controller !== box.controller)
      throw new Error("Postbox controller mismatch");
    const component = office.mailboxRefs.find(
      (p) => p.id === box.id,
    )?.component;
    if (!component) return { revision: "0", ciphertext: "" };
    const r = await readWithTimeout(this.provider.getSubstate(component));
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
        this.deployment.template ||
      c.header.owner_rule !== "None"
    )
      throw new Error("Untrusted mailbox component");
    return {
      ...(this.deployment.contractProtocol === "unified-2"
        ? decodeV4Mailbox(c.body.state, sealedProfileFor(this.deployment), box)
        : decodeMailboxState(c.body.state, this.deployment, box)),
      component,
    };
  }
  async saveMailbox(
    wallet: ConnectedWallet,
    account: WalletAccount,
    box: Postbox,
    expected: { revision: string; component?: string },
    ciphertext: string,
    fee: string,
    storage: Storage,
  ) {
    if (
      !(wallet instanceof SapientSession) ||
      !mailboxStateReady(this.deployment) ||
      account.account.owner_public_key !== box.controller
    )
      throw new Error("Verified Sapient mailbox settings are unavailable");
    const latest = await this.readMailbox(box);
    if (
      latest.revision !== expected.revision ||
      latest.component !== expected.component
    )
      throw new Error("Mailbox state changed; reload before saving");
    const epoch = await readWithTimeout(this.provider.getCurrentEpoch());
    const tx = mailboxStateTransaction(
      this.deployment,
      account.account.component_address,
      fee,
      epoch,
      box.id,
      ciphertext,
      expected.revision,
      expected.component,
    );
    return this.submitControlled(
      wallet,
      account,
      tx,
      fee,
      storage,
      "mailbox",
      `mailbox:${box.id}`,
    );
  }
  async resolveReceivingAddress(address: string, allowCreation: boolean) {
    const resolved = receivingAddress(address, this.deployment.network);
    let r;
    try {
      r = await readWithTimeout(
        this.provider.getSubstate(resolved.destination),
      );
    } catch (error) {
      // Only an explicit not-found response can enable account creation. An
      // outage, timeout or malformed reply must never be treated as absence.
      if (
        !error ||
        typeof error !== "object" ||
        !("status" in error) ||
        error.status !== 404
      )
        throw new Error(
          "Could not check this wallet address right now. Try again; nothing was submitted.",
        );
      if (!allowCreation)
        throw new Error(
          "This address is not ready to receive a postbox gift. Choose your connected Sapient account.",
        );
      if (!claimsReady(this.deployment, true))
        throw new Error(
          "Receiving at a new address is not enabled for this post office. Connect Sapient to choose an existing account.",
        );
      return { ...resolved, createAccount: true };
    }
    const v = r?.substate as unknown as {
      Component?: {
        header: {
          owner_rule: { ByPublicKey?: unknown };
          template_address: string;
        };
      };
    };
    const header = v?.Component?.header;
    if (
      typeof header?.template_address !== "string" ||
      header.template_address.replace(/^template_/, "") !== "0".repeat(64) ||
      bytes(header.owner_rule?.ByPublicKey) !== resolved.owner
    )
      throw new Error(
        "This wallet address could not be verified as a compatible receiving account. Nothing was submitted.",
      );
    return { ...resolved, createAccount: false };
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
      const r = await readWithTimeout(this.provider.getSubstate(component));
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
    postage: "transparent" | "private" = "transparent",
  ) {
    if (
      postage === "private" &&
      this.deployment.evidence.nativePrivatePostage !== true
    )
      throw new Error(
        "Native private postage is not verified for this deployment and stock wallet. No public fallback was requested.",
      );
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
      await readWithTimeout(this.provider.getCurrentEpoch()),
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
        ...(await readWithTimeout(
          getVaultIdsForAccount(
            this.provider,
            account.account.component_address,
          ),
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
      tx.inputs = await readWithTimeout(this.provider.resolveInputs(tx.inputs));
      return wallet.submitOperation(
        tx,
        fee,
        storage,
        {
          network: this.deployment.network,
          registry: this.deployment.registry,
          operation: "publish",
          envelopeId: envelope.id,
        },
        postage,
      );
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
    const epoch = await readWithTimeout(this.provider.getCurrentEpoch());
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
      ...(await readWithTimeout(
        getVaultIdsForAccount(this.provider, envelope.component),
      )),
      ...(createAccount
        ? []
        : await readWithTimeout(
            getVaultIdsForAccount(this.provider, destination),
          )),
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
    const tx = await readWithTimeout(resolveTransaction(this.provider, rawTx));
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
    operation: "postbox" | "claim" | "mailbox",
    identity: string,
    postboxAction?: "create" | "edit" | "rotate",
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
        ...(await readWithTimeout(
          getVaultIdsForAccount(
            this.provider,
            account.account.component_address,
          ),
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
      tx.inputs = await readWithTimeout(this.provider.resolveInputs(tx.inputs));
      return wallet.submitOperation(tx, feeCap, storage, {
        network: this.deployment.network,
        registry: this.deployment.registry,
        operation,
        envelopeId: identity,
        ...(postboxAction ? { postboxAction } : {}),
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
      ...(postboxAction ? { postboxAction } : {}),
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
    const nameError = postboxNameError(box.nickname);
    if (nameError) throw new Error(nameError);
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
      await readWithTimeout(this.provider.getCurrentEpoch()),
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
      operation,
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
        vaults: (account) =>
          readWithTimeout(getVaultIdsForAccount(this.provider, account)),
        epoch: () => readWithTimeout(this.provider.getCurrentEpoch()),
        resolveInputs: (inputs) =>
          readWithTimeout(this.provider.resolveInputs(inputs)),
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
      await readWithTimeout(this.provider.getCurrentEpoch()),
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
    const r = await readWithTimeout(this.provider.getTransactionResult(id));
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
    const epoch = await readWithTimeout(this.provider.getCurrentEpoch());
    if (
      !Number.isSafeInteger(epoch) ||
      epoch < 0 ||
      epoch > Number.MAX_SAFE_INTEGER - 10
    )
      throw new Error("Invalid claim epoch");
    const expiry = postboxClaimExpiry(epoch);
    const proof = await wallet.authorizePostboxClaim(
      latest,
      destination,
      expiry,
    );
    const currentEpoch = await readWithTimeout(this.provider.getCurrentEpoch());
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
      ...(await readWithTimeout(
        getVaultIdsForAccount(this.provider, latest.component),
      )),
      ...(await readWithTimeout(
        getVaultIdsForAccount(this.provider, destination),
      )),
    ];
    raw.inputs = Array.from(new Set(ids)).map((substate_id) => ({
      substate_id,
      version: null,
      is_write:
        substate_id !== this.deployment.registry &&
        substate_id !== this.deployment.resource &&
        !substate_id.startsWith("template_"),
    }));
    const tx = await readWithTimeout(resolveTransaction(this.provider, raw));
    const signer = EphemeralKeySigner.generate(
      this.deployment.network as Network,
    );
    // Ootle 0.45 separates simulation from consensus submission. SDK 0.7's
    // sendDryRun still uses /transactions and is rejected by that endpoint.
    const dryEnvelope = sealTransaction(
      await signTransaction([signer], { ...tx, dry_run: true }),
    );
    // Simulation is noncommitting. A timed-out response must not continue into broadcast.
    const dry = await readWithTimeout(
      this.provider.getClient().getTransport().sendPost<{
        transaction_id: string;
        result: {
          finalize: {
            result: Record<string, unknown>;
            total_fees_required: string | number;
          };
        };
      }>("transactions/dry-run", { transaction: dryEnvelope }),
    );
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
