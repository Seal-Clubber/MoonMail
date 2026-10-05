import fs from "node:fs/promises";
import { PostOfficeClient } from "../src/core/chain";
import { WalletSession } from "../src/core/wallet";
import { emptyDeployment, writesReady } from "../src/core/config";
import { planRefill, type Journal, type KeeperConfig } from "./keeper";
import type { Deployment, Envelope } from "../src/core/types";
const args = process.argv.slice(2),
  run = args.includes("--run"),
  once = args.includes("--once");
const configPath =
  args.find((a) => a.endsWith(".json")) || "keeper.config.json";
const c: KeeperConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
const d: Deployment = JSON.parse(
  await fs.readFile("public/deployment.json", "utf8"),
);
const journalContext = JSON.stringify([d.network, d.registry, c.campaign]);
let journal: Journal;
try {
  journal = JSON.parse(await fs.readFile(".keeper-state.json", "utf8"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  journal = { reservations: [] };
}
if (journal.reservations.length && journal.context !== journalContext)
  throw new Error(
    "Keeper journal belongs to another deployment/campaign or needs explicit migration; refusing to reset budget",
  );
journal.context = journalContext;
const persist = async () => {
  await fs.writeFile(
    ".keeper-state.json.tmp",
    JSON.stringify(journal, null, 2),
    { mode: 0o600 },
  );
  await fs.rename(".keeper-state.json.tmp", ".keeper-state.json");
};
if (!d.registry) {
  console.log("No deployed registry configured. Keeper will not spend.");
  process.exit(0);
}
const chain = await PostOfficeClient.connect({ ...emptyDeployment, ...d });
if (run && !writesReady(d, "public"))
  throw new Error("Refusing donor spending: deployment evidence is incomplete");
let wallet: WalletSession | undefined,
  stop = false;
process.once("SIGINT", () => {
  stop = true;
});
process.once("SIGTERM", () => {
  stop = true;
});
try {
  if (run) {
    if (
      !process.env.GHOSTDROP_DONOR_API_KEY ||
      !process.env.GHOSTDROP_DONOR_URL
    )
      throw new Error(
        "Provide a dedicated donor daemon URL and API key in the process environment",
      );
    wallet = await WalletSession.connect(
      process.env.GHOSTDROP_DONOR_URL,
      process.env.GHOSTDROP_DONOR_API_KEY,
      d.network,
    );
  }
  do {
    const letters: Envelope[] = [];
    let cursor = "";
    do {
      const page = await chain.read(cursor);
      letters.push(...page.letters);
      cursor = page.nextCursor;
    } while (cursor && !stop);
    if (stop) break;
    for (const r of journal.reservations.filter((r) =>
      ["prepared", "pending", "unknown"].includes(r.state),
    )) {
      if (
        letters.some(
          (e) =>
            e.id === r.envelopeId &&
            e.mode === "public" &&
            e.campaign === c.campaign,
        )
      ) {
        r.state = "confirmed";
        continue;
      }
      if (r.txId) {
        try {
          const outcome = await chain.reconcile(r.txId);
          if (outcome?.outcome === "Commit") r.state = "confirmed";
          else r.state = "unknown";
        } catch {
          r.state = "unknown";
        }
      }
    }
    const plan = planRefill(c, journal, letters);
    console.log(
      JSON.stringify({ campaign: c.campaign, ...plan, dryRun: !run }),
    );
    if (
      !run ||
      stop ||
      (plan.count === 0 && BigInt(plan.remaining) < BigInt(plan.cost))
    )
      break;
    await persist();
    // Selected funding account is explicit; never silently changes the default daemon account.
    const funding = wallet!.accounts.find(
      (a) =>
        a.account.component_address === process.env.GHOSTDROP_DONOR_ACCOUNT,
    );
    if (!funding)
      throw new Error("Select an accessible GHOSTDROP_DONOR_ACCOUNT component");
    for (let i = 0; i < plan.count && !stop; i++) {
      const envelopeId = crypto.randomUUID();
      const reservation = {
        envelopeId,
        cost: plan.cost,
        state: "prepared" as const,
      };
      journal.reservations.push(reservation);
      await persist();
      const e: Envelope = {
        id: envelopeId,
        mode: "public",
        context: d,
        payload: {
          subject: "A little kindness from the other side",
          body: "Take this test gift and leave a little light behind you.",
        },
        gift: c.gift,
        reserve: c.reserve,
        claimed: false,
        sender: funding.account.owner_public_key,
        campaign: c.campaign,
      };
      const storageData = new Map<string, string>();
      const storage = {
        getItem: (k: string) => storageData.get(k) || null,
        setItem: (k: string, v: string) => {
          storageData.set(k, v);
        },
      } as Storage;
      try {
        const txId = await chain.publish(
          wallet!,
          funding,
          e,
          c.publicationCap,
          storage,
        );
        Object.assign(reservation, { txId, state: "pending" });
      } catch {
        Object.assign(reservation, { state: "unknown" });
        console.log(
          "Submission uncertain; reservation retained. Reconcile before replacement.",
        );
        stop = true;
      }
      await persist();
    }
    if (!once && !stop)
      await new Promise((resolve) => setTimeout(resolve, 15_000));
  } while (!once && !stop);
} finally {
  wallet?.disconnect();
  chain.provider.stopWatcher();
  if (run) await persist();
}
