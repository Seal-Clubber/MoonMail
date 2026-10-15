import { test, expect, vi } from "vitest";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { SapientSession, type SapientProvider } from "../src/core/sapient";
import {
  privateTari,
  paymentMemo,
  type PaymentRequest,
  type PaymentReceipt,
} from "../src/core/private-payment";
async function fixture() {
  const owner = generateKeypair(),
    view = generateKeypair(),
    address = generateOotleAddress(owner.public_key, view.public_key, 38);
  owner.free();
  view.free();
  let granted = true,
    privateSpend = true,
    privateFees = true,
    privateScan = true,
    memo = paymentMemo("3".repeat(64)),
    amount = "10000",
    selected = `component_${"a".repeat(64)}`;
  const request = vi.fn(
    async ({ method, params }: { method: string; params?: any }) => {
      if (method === "tari_getNetwork") return "esmeralda";
      if (["tari_requestAccounts", "tari_getAccounts"].includes(method))
        return [selected];
      if (method === "tari_getWalletAddress") return address;
      if (method === "tari_getCapabilities")
        return {
          transactionRequests: true,
          walletAddress: true,
          supportsPrivateFees: privateFees,
          privateSpend,
          privateScan,
        };
      if (method === "tari_getViewAccess") return { granted };
      if (method === "tari_createTransactionRequest")
        return { requestId: "original-payment-request" };
      if (method === "tari_getTransactionRequest")
        return { requestId: params.requestId, status: "approved" };
      if (method === "tari_submitTransactionRequest")
        return {
          transactionId: "4".repeat(64),
          recipientCommitment: "5".repeat(64),
        };
      if (method === "tari_claimPrivatePayment") return { amount, memo };
      throw Error("Unexpected wallet method");
    },
  );
  const provider: SapientProvider = {
    isTariWallet: true,
    info: { name: "Sapient", rdns: "mw.tari.sapient", embedded: false },
    request,
  };
  const wallet = await SapientSession.connect(38, provider),
    invoice: PaymentRequest = {
      version: "mm-payment-1",
      kind: "request",
      resource: privateTari,
      amount: "10000",
      destination: address,
      nonce: "2".repeat(64),
    },
    receipt: PaymentReceipt = {
      ...invoice,
      kind: "receipt",
      requestLetter: "1".repeat(64),
      intentLetter: "3".repeat(64),
      transactionId: "4".repeat(64),
      commitment: "5".repeat(64),
    };
  return {
    wallet,
    request,
    invoice,
    receipt,
    setGrant: (v: boolean) => {
      granted = v;
    },
    setCaps: (spend: boolean, fees = true, scan = true) => {
      privateSpend = spend;
      privateFees = fees;
      privateScan = scan;
    },
    setMemo: (v: string) => {
      memo = v;
    },
    setAmount: (v: string) => {
      amount = v;
    },
    switchAccount: () => {
      selected = `component_${"b".repeat(64)}`;
    },
  };
}
test("native spend requests enforce private funding, zero value promise and the recovery memo without asking for view permission", async () => {
  const f = await fixture();
  f.setGrant(false);
  await f.wallet.createPrivatePayment(f.invoice, "3".repeat(64), "30000");
  const create = f.request.mock.calls.find(
    ([p]) => p.method === "tari_createTransactionRequest",
  )![0];
  expect(create.params).toMatchObject({
    kind: "sendPrivately",
    feeType: "private",
    enforceFeeType: true,
    minimumValuePromise: "0",
    amount: "10000",
    recipientWalletAddress: f.invoice.destination,
    memo: paymentMemo("3".repeat(64)),
    maxFee: "30000",
  });
  expect(
    f.request.mock.calls.some(([p]) => p.method === "tari_requestViewAccess"),
  ).toBe(false);
});
test("changed native capabilities or wallet account fail before a spend is created", async () => {
  for (const kind of ["spend", "fees", "account"]) {
    const f = await fixture();
    if (kind === "account") f.switchAccount();
    else f.setCaps(kind !== "spend", kind !== "fees");
    await expect(
      f.wallet.createPrivatePayment(f.invoice, "3".repeat(64), "30000"),
    ).rejects.toThrow();
    expect(
      f.request.mock.calls.some(
        ([p]) => p.method === "tari_createTransactionRequest",
      ),
    ).toBe(false);
  }
});
test("import requires the existing private grant, exact wallet, amount and memo and never requests spending", async () => {
  const f = await fixture();
  await expect(f.wallet.importPrivatePayment(f.receipt)).resolves.toEqual({
    amount: "10000",
  });
  f.setGrant(false);
  await expect(f.wallet.importPrivatePayment(f.receipt)).rejects.toThrow(
    "view",
  );
  f.setGrant(true);
  f.setMemo("another payment");
  await expect(f.wallet.importPrivatePayment(f.receipt)).rejects.toThrow(
    "memo",
  );
  f.setMemo(paymentMemo(f.receipt.intentLetter));
  f.setAmount("9999");
  await expect(f.wallet.importPrivatePayment(f.receipt)).rejects.toThrow(
    "amount",
  );
  expect(
    f.request.mock.calls.some(([p]) =>
      /createTransaction|submitTransaction|requestView/.test(p.method),
    ),
  ).toBe(false);
});
