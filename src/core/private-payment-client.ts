import { classifyOutcome } from "@tari-project/ootle";
import type { Deployment, Postbox } from "./types";
import { SapientSession } from "./sapient";
import { SealedMailboxSession } from "./sealed-mailbox";
import type { SealedOfficeClient } from "./sealed-office";
import {
  payPrivateRequest,
  type PrivatePaymentFlowPort,
} from "./private-payment-flow";
import {
  verifyPaymentOutput,
  verifyLivePaymentOutput,
  paymentOutputId,
  verifyReceivedPayment,
  type PaymentReceipt,
} from "./private-payment";
import { readPending, savePending } from "./pending";
import { readDelivery } from "./delivery";
import type { PostOfficeClient } from "./chain";
import { readWithTimeout } from "./read-timeout";

export function privatePaymentClient(
  deployment: Deployment,
  chain: PostOfficeClient,
  session: SealedMailboxSession,
  wallet: SapientSession,
  box: Postbox,
  storage: Storage,
  status: (message: string) => void,
) {
  if (
    deployment.contractProtocol !== "unified-2" ||
    deployment.evidence.nativePrivatePayments !== true ||
    deployment.evidence.nativePrivatePostage !== true ||
    chain.deployment.registry !== deployment.registry ||
    wallet.accounts[0].account.owner_public_key !== box.controller
  )
    throw new Error(
      "Private payments await verified stock-wallet delivery and recovery evidence",
    );
  const office: SealedOfficeClient = chain.sealedOffice();
  const assertCurrent = async () => {
    if (session.isDisposed)
      throw new Error(
        "Private payment session changed; reconnect and resume the original record",
      );
    await wallet.assertCurrent();
    await session.messages();
  };
  const read = async (id: string) => {
    await assertCurrent();
    const state = await office.readOffice();
    if (!state.sealedRefs.some((r) => r.id === id)) return;
    await session.retryUnavailable([id]);
    const opened = (await session.messages()).find((m) => m.id === id);
    if (!opened)
      throw new Error(
        "This payment record is occupied but cannot be authenticated. Do not create another payment.",
      );
    return opened;
  };
  const verifyReceipt = async (receipt: PaymentReceipt) => {
    try {
      const r = await readWithTimeout(
        chain.provider.getTransactionResult(receipt.transactionId),
      );
      verifyPaymentOutput(receipt, r);
      return true;
    } catch (error) {
      if ((error as { status?: number })?.status !== 404) throw error;
      verifyLivePaymentOutput(
        await readWithTimeout(
          chain.provider.getSubstate(paymentOutputId(receipt)),
        ),
      );
      return false;
    }
  };
  const confirmed = async (id: string) => {
    const end = Date.now() + 60000;
    do {
      await assertCurrent();
      const pending = readPending(storage).find((p) => p.id === id);
      if (pending) {
        const next = await readDelivery(chain, pending);
        savePending(storage, next);
        if (next.state === "confirmed") return;
        if (next.state === "rejected")
          throw new Error(
            "Original recovery letter was rejected. Reconcile it; do not pay again.",
          );
      } else {
        const r = await readWithTimeout(
            chain.provider.getTransactionResult(id),
          ),
          outcome = classifyOutcome(r.result);
        if (outcome?.outcome === "Commit") return;
        if (outcome?.outcome === "Reject")
          throw new Error(
            "Original private payment did not commit; inspect Sapient history before any replacement.",
          );
      }
      await new Promise((r) => setTimeout(r, 700));
    } while (Date.now() < end);
    throw new Error(
      "The original transaction is still unconfirmed. Resume its saved approval; do not pay again.",
    );
  };
  const port: PrivatePaymentFlowPort = {
    context: deployment,
    payer: box.controller,
    postbox: box.id,
    account: wallet.accounts[0].account.component_address,
    storage,
    assertCurrent,
    read,
    confirmed,
    verifyReceipt: async (receipt) => {
      await verifyReceipt(receipt);
    },
    status,
    create: (request, id, fee) => wallet.createPrivatePayment(request, id, fee),
    inspect: (id) => wallet.inspectPrivatePayment(id),
    submit: (id) => wallet.submitPrivatePayment(id),
    publish: async (id, payment, source) => {
      await assertCurrent();
      const prepared = await session.prepare(
        {
          subject:
            payment.kind === "intent"
              ? "Private payment · recovery record"
              : "Private payment · receipt",
          body:
            payment.kind === "intent"
              ? "An encrypted recovery record was saved before MoonMail submits the payment. A payment receipt confirms the separate transfer."
              : "This encrypted receipt lets the receiving Sapient wallet verify and import the private payment. Reading this letter sends no transaction.",
          privatePayment: payment,
        },
        source.message.sender.postbox,
        { id, replyTo: source.id, privateReply: true },
      );
      const originalIntent =
        payment.kind === "receipt"
          ? (await read(payment.intentLetter))?.message.letter.privatePayment
          : undefined;
      if (payment.kind === "receipt" && originalIntent?.kind !== "intent")
        throw new Error("The original payment fee cap cannot be recovered");
      return office.publish(
        wallet,
        prepared,
        payment.kind === "intent"
          ? payment.feeCap
          : (originalIntent as { feeCap: string }).feeCap,
        storage,
        "private",
      );
    },
  };
  return {
    async pay(requestId: string, feeCap: string) {
      const source = await read(requestId);
      if (!source)
        throw new Error("Original private payment request is unavailable");
      return payPrivateRequest(port, source, feeCap);
    },
    async import(receiptId: string) {
      const entry = await read(receiptId),
        receipt = entry?.message.letter.privatePayment;
      if (!entry || receipt?.kind !== "receipt")
        throw new Error("Open the authenticated private payment receipt");
      const request = await read(receipt.requestLetter),
        intent = await read(receipt.intentLetter),
        state = await office.readOffice();
      if (!request || !intent)
        throw new Error(
          "Load the original request and recovery record before verifying payment",
        );
      const payer = state.postboxes.find(
        (p) => p.id === request.message.recipient.postbox,
      );
      if (!payer) throw new Error("Payment sender postbox cannot be verified");
      const verified = await verifyReceivedPayment(
        deployment,
        entry,
        request,
        intent,
        box.controller,
        payer.controller,
      );
      const transactionHistoryAvailable = await verifyReceipt(verified);
      verifyLivePaymentOutput(
        await readWithTimeout(
          chain.provider.getSubstate(paymentOutputId(verified)),
        ),
      );
      await assertCurrent();
      return {
        ...(await wallet.importPrivatePayment(verified)),
        transactionHistoryAvailable,
      };
    },
  };
}
