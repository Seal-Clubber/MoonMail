import { liveSubstate } from "./substate";
import { IndexerProvider } from "@tari-project/ootle-indexer";
import {
  Network,
  TransactionBuilder,
  stringLiteral,
  amountLiteral,
  resourceAddressLiteral,
  componentAddressLiteral,
  getVaultIdsForAccount,
} from "@tari-project/ootle";
import type { Deployment } from "./types";
import type { Pending } from "./pending";
import { hasUnresolved } from "./pending";
import { SapientSession } from "./sapient";
import { endpoint } from "./config";
import { readWithTimeout } from "./read-timeout";
import { taggedAddress } from "./state-codecs";
import {
  decodePotCatalog,
  decodePotRound,
  potPhase,
  potRules,
  potWritesReady,
  type PotProfile,
  type PotRound,
} from "./moon-pot";
import { money } from "./transactions";
export type PotAction = NonNullable<Pending["potAction"]>;
export interface PotIntent {
  action: PotAction;
  round?: string;
  postbox?: string;
  amount?: string;
  message?: string;
}
export function parsePotProfile(value: unknown, d: Deployment): PotProfile {
  const p = value as PotProfile;
  if (
    !p ||
    p.network !== 38 ||
    d.network !== 38 ||
    p.registry !== d.registry ||
    p.template !== d.template ||
    !/^component_[a-f0-9]{64}$/.test(p.catalog) ||
    !/^[a-f0-9]{64}$/.test(p.potTemplate) ||
    !p.evidence ||
    ["engine", "drawSecurity", "stockSapient", "livePayout"].some(
      (k) =>
        typeof (p.evidence as unknown as Record<string, unknown>)[k] !==
        "boolean",
    ) ||
    (p.experimental !== undefined && typeof p.experimental !== "boolean")
  )
    throw new Error(
      "Moon Pot configuration does not match this Esmeralda post office",
    );
  return p;
}
export function potTransaction(
  d: Deployment,
  p: PotProfile,
  round: PotRound | undefined,
  epoch: number,
  account: string,
  fee: string,
  intent: PotIntent,
) {
  if (
    d.network !== 38 ||
    p.network !== 38 ||
    p.registry !== d.registry ||
    p.template !== d.template
  )
    throw new Error(
      "Moon Pot is only available on the configured Esmeralda office",
    );
  const target = intent.action === "open" ? p.catalog : round?.component;
  if (!target || !/^component_[a-f0-9]{64}$/.test(target))
    throw new Error("Choose a verified pot round");
  let builder = TransactionBuilder.new(
    Network.Esmeralda,
    epoch + 3,
  ).feeTransactionPayFromComponent(account, money(fee));
  if (intent.action === "contribute") {
    const amount = money(intent.amount || "");
    if (
      !round ||
      potPhase(round, epoch) !== "open" ||
      amount < potRules.minEntry ||
      amount + BigInt(round.total) > potRules.maxPot ||
      round.entries.length >= potRules.maxEntries ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(intent.postbox || "") ||
      !intent.message?.trim() ||
      new TextEncoder().encode(intent.message).length > 512
    )
      throw new Error(
        "Review the postbox, public message, amount and contribution deadline",
      );
    builder = builder
      .callMethod({ componentAddress: account, methodName: "withdraw" }, [
        resourceAddressLiteral(d.resource),
        amountLiteral(amount),
      ])
      .saveVar("pot_contribution")
      .callMethod({ componentAddress: target, methodName: "contribute" }, [
        stringLiteral(intent.postbox!),
        stringLiteral(intent.message),
        { Workspace: "pot_contribution" },
      ]);
  } else if (intent.action === "open")
    builder = builder.callMethod(
      { componentAddress: target, methodName: "open_round" },
      [],
    );
  else if (intent.action === "draw") {
    if (
      !round ||
      potPhase(round, epoch) !== "draw" ||
      BigInt(round.total) === 0n
    )
      throw new Error("The fixed draw window is not open");
    builder = builder.callMethod(
      { componentAddress: target, methodName: "draw" },
      [],
    );
  } else if (intent.action === "claim") {
    if (!round || potPhase(round, epoch) !== "won")
      throw new Error("No available prize");
    builder = builder.callMethod(
      { componentAddress: target, methodName: "claim" },
      [componentAddressLiteral(account)],
    );
  } else {
    if (
      !round ||
      potPhase(round, epoch) !== "refund" ||
      !intent.postbox ||
      !round.participants[intent.postbox] ||
      round.participants[intent.postbox].refunded
    )
      throw new Error("No available refund for this postbox");
    builder = builder.callMethod(
      { componentAddress: target, methodName: "refund" },
      [stringLiteral(intent.postbox), componentAddressLiteral(account)],
    );
  }
  return builder.buildUnsignedTransaction();
}
export class MoonPotClient {
  private constructor(
    readonly d: Deployment,
    readonly profile: PotProfile,
    readonly provider: IndexerProvider,
  ) {}
  static async connect(d: Deployment, p: PotProfile) {
    parsePotProfile(p, d);
    const provider = await readWithTimeout(
      IndexerProvider.connect({
        url: endpoint(d.indexerUrl, false),
        network: Network.Esmeralda,
      }),
    );
    return new MoonPotClient(d, p, provider);
  }
  stop() {
    this.provider.stopWatcher();
  }
  private async state(component: string) {
    const r = await readWithTimeout(this.provider.getSubstate(component));
    const v = liveSubstate(r) as unknown as {
      Component?: {
        header: { template_address: string; owner_rule: unknown };
        body: { state: unknown };
      };
    };
    if (
      !v.Component ||
      v.Component.header.owner_rule !== "None" ||
      v.Component.header.template_address.replace(/^template_/, "") !==
        this.profile.potTemplate
    )
      throw new Error("Untrusted Moon Pot template or owner rule");
    return v.Component.body.state;
  }
  async read(limit = 8, selected?: string) {
    const catalog = decodePotCatalog(
      await this.state(this.profile.catalog),
      this.profile,
    );
    const epoch = await readWithTimeout(this.provider.getCurrentEpoch());
    const history: PotRound[] = [];
    const refs = catalog.rounds.slice(0, Math.max(1, Math.min(limit, 256)));
    if (selected && !refs.some((r) => r.component === selected)) {
      const ref = catalog.rounds.find((r) => r.component === selected);
      if (!ref)
        throw new Error("This round is not registered in the pot catalog");
      refs.push(ref);
    }
    for (const ref of refs) {
      const raw = await this.state(ref.component),
        round = decodePotRound(raw, this.profile, ref.component);
      if (ref.start !== round.start)
        throw new Error("Moon Pot catalog/round mismatch");
      round.vault = taggedAddress((raw as unknown[])[13], "vault");
      history.push(round);
    }
    return {
      epoch,
      next: catalog.next,
      round: selected
        ? history.find((r) => r.component === selected)
        : history[0],
      history,
      totalRounds: catalog.rounds.length,
    };
  }
  async submit(
    wallet: SapientSession,
    fee: string,
    storage: Storage,
    intent: PotIntent,
    experimentalAccepted: boolean,
    postage: "private" | "transparent" = "private",
  ) {
    if (
      !potWritesReady(this.profile, experimentalAccepted) ||
      wallet.network !== 38
    )
      throw new Error(
        "Moon Pot financial actions are not enabled for this deployment",
      );
    const current = wallet.accounts[0],
      account = current?.account.component_address;
    if (!account) throw new Error("Connect your Sapient account");
    if (
      postage === "private" &&
      (!wallet.privateFeeCapable ||
        this.d.evidence.nativePrivatePostage !== true)
    )
      throw new Error(
        "Private fee funding is unavailable. Choose public fee funding explicitly if you want to continue",
      );
    const live = await this.read(1, intent.round),
      round = live.round;
    if (intent.action === "open" && live.epoch < live.next)
      throw new Error("The current weekly round is still running");
    if (
      intent.action === "claim" &&
      round?.participants[round.winner]?.controller !==
        current.account.owner_public_key
    )
      throw new Error("Only the winning postbox wallet can collect");
    if (
      intent.action === "refund" &&
      round?.participants[intent.postbox || ""]?.controller !==
        current.account.owner_public_key
    )
      throw new Error("Choose your own contributing postbox");
    const target =
      intent.action === "open" ? this.profile.catalog : round?.component;
    const identity = `pot:${intent.action}:${target}:${intent.action === "open" ? live.next : intent.postbox || account}`;
    if (hasUnresolved(storage, 38, this.d.registry, identity))
      throw new Error(
        "Reconcile the original Moon Pot request in Activity before trying again",
      );
    const tx = potTransaction(
      this.d,
      this.profile,
      round,
      live.epoch,
      account,
      fee,
      intent,
    );
    const vaults = await readWithTimeout(
      getVaultIdsForAccount(this.provider, account),
    );
    const ids = [
      this.d.registry,
      account,
      this.d.resource,
      `template_${this.profile.potTemplate}`,
      `template_${this.d.template}`,
      this.profile.catalog,
      ...vaults,
      ...(round
        ? [round.component, ...(round.vault ? [round.vault] : [])]
        : []),
    ];
    tx.inputs = Array.from(
      new Map(
        [
          ...tx.inputs,
          ...ids.map((substate_id) => ({
            substate_id,
            version: null,
            is_write:
              substate_id === account ||
              substate_id.startsWith("vault_") ||
              substate_id === target,
          })),
        ].map((i) => [i.substate_id, i]),
      ).values(),
    );
    tx.inputs = await readWithTimeout(this.provider.resolveInputs(tx.inputs));
    return wallet.submitOperation(
      tx,
      fee,
      storage,
      {
        network: 38,
        registry: this.d.registry,
        operation: "pot",
        potAction: intent.action,
        envelopeId: identity,
      },
      postage,
    );
  }
}
