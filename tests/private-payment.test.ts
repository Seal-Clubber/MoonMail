import { expect, test, vi } from "vitest";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { hex } from "../src/core/crypto";
import {
  parsePrivatePayment,
  paymentLetterId,
  paymentMemo,
  paymentOutputId,
  verifyPaymentOutput,
  privateTari,
  verifyReceivedPayment,
  verifyLivePaymentOutput,
  type PaymentRequest,
  type PaymentReceipt,
} from "../src/core/private-payment";
import {
  payPrivateRequest,
  type PrivatePaymentFlowPort,
} from "../src/core/private-payment-flow";
import {
  sealPrivateMail,
  openPrivateMail,
  type RecoveredSealedMail,
} from "../src/core/sealed-mail";
const context = {
  network: 38,
  registry: `component_${"a".repeat(64)}`,
  template: "b".repeat(64),
};
function fixture() {
  const payee = generateKeypair(),
    view = generateKeypair(),
    payer = generateKeypair();
  const address = generateOotleAddress(payee.public_key, view.public_key, 38),
    owner = hex(payee.public_key),
    payerOwner = hex(payer.public_key);
  const source: RecoveredSealedMail = {
    id: "11".repeat(32),
    inbox: true,
    sent: false,
    message: {
      version: "mm-message-2",
      sender: {
        postbox: "payee",
        controller: owner,
        keyVersion: 1,
        publicKey: owner,
      },
      recipient: { postbox: "payer", keyVersion: 1, publicKey: payerOwner },
      letter: {
        subject: "An encrypted invoice",
        body: "Please pay privately",
        privatePayment: {
          version: "mm-payment-1",
          kind: "request",
          nonce: "22".repeat(32),
          resource: privateTari,
          amount: "12345",
          destination: address,
        },
      },
    },
  };
  const request = source.message.letter.privatePayment as PaymentRequest,
    records = new Map<string, RecoveredSealedMail>(),
    data = new Map<string, string>();
  let nativeState = "approved",
    lostSubmit = false,
    lostReceipt = false,
    lostCreate = false;
  const port: PrivatePaymentFlowPort = {
    context,
    payer: payerOwner,
    account: `component_${"c".repeat(64)}`,
    postbox: "payer",
    storage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    } as Storage,
    assertCurrent: vi.fn(async () => {}),
    status: vi.fn(),
    read: vi.fn(async (id) => structuredClone(records.get(id))),
    create: vi.fn(async () => {
      if (lostCreate) throw Error("create response lost");
      return "native-request-1";
    }),
    inspect: vi.fn(async (id) => ({
      requestId: id,
      status: nativeState,
      result: {
        transactionId: "33".repeat(32),
        recipientCommitment: "44".repeat(32),
        minimumValuePromise: "0",
      },
    })),
    submit: vi.fn(async () => {
      nativeState = "submitted";
      if (lostSubmit) throw Error("submit response lost");
      return {
        transactionId: "33".repeat(32),
        recipientCommitment: "44".repeat(32),
        minimumValuePromise: "0",
      };
    }),
    confirmed: vi.fn(async () => {}),
    verifyReceipt: vi.fn(async () => {}),
    publish: vi.fn(async (id, payment) => {
      if (payment.kind === "receipt" && lostReceipt)
        throw Error("receipt approval lost");
      records.set(id, {
        id,
        inbox: false,
        sent: true,
        message: {
          version: "mm-message-2",
          sender: {
            postbox: "payer",
            controller: payerOwner,
            keyVersion: 1,
            publicKey: payerOwner,
          },
          recipient: { postbox: "payee", keyVersion: 1, publicKey: owner },
          letter: {
            subject: "Encrypted payment record",
            body: "Encrypted bookkeeping",
            privatePayment: payment,
            thread: {
              version: "gd-thread-1",
              root: source.id,
              parent: source.id,
            },
          },
        },
      });
      return "55".repeat(32);
    }),
  };
  const cleanup = () => {
    payee.free();
    view.free();
    payer.free();
  };
  return {
    port,
    source,
    request,
    records,
    data,
    payer,
    payee,
    owner,
    cleanup,
    setLostSubmit: () => {
      lostSubmit = true;
    },
    setLostReceipt: (v = true) => {
      lostReceipt = v;
    },
    setLostCreate: () => {
      lostCreate = true;
    },
    reject: () => {
      nativeState = "rejected";
    },
  };
}
test("private payment addresses bind the encrypted invoice to its authenticated author", () => {
  const f = fixture();
  try {
    expect(parsePrivatePayment(f.request, 38, f.owner)).toEqual(f.request);
    for (const p of [
      { ...f.request, amount: "0" },
      { ...f.request, amount: "01" },
      { ...f.request, resource: `resource_${"f".repeat(64)}` },
      { ...f.request, nonce: "0".repeat(64) },
      { ...f.request, publicRecipient: "oops" },
    ])
      expect(() => parsePrivatePayment(p, 38, f.owner)).toThrow();
    expect(() => parsePrivatePayment(f.request, 36, f.owner)).toThrow();
    expect(() => parsePrivatePayment(f.request, 38, f.port.payer)).toThrow();
  } finally {
    f.cleanup();
  }
});
test("payment record IDs bind office, payer and encrypted invoice nonce", async () => {
  const f = fixture();
  try {
    const id = await paymentLetterId(
      context,
      f.source.id,
      f.request,
      f.port.payer,
      "intent",
    );
    for (const [c, r, p, phase] of [
      [{ ...context, network: 36 }, f.request, f.port.payer, "intent"],
      [
        context,
        { ...f.request, nonce: "88".repeat(32) },
        f.port.payer,
        "intent",
      ],
      [context, f.request, "99".repeat(32), "intent"],
      [context, f.request, f.port.payer, "receipt"],
    ] as const)
      expect(await paymentLetterId(c, f.source.id, r, p, phase)).not.toBe(id);
  } finally {
    f.cleanup();
  }
});
test("encrypted payment request restores Inbox and Sent without exposing amount or receiving address", async () => {
  const f = fixture();
  try {
    const payload = await sealPrivateMail(
      f.source.message,
      { ...context, senderPublicKey: f.owner },
      f.source.id,
    );
    expect(JSON.stringify(payload)).not.toContain(f.request.destination);
    expect(JSON.stringify(payload)).not.toContain('"amount"');
    const opened = await openPrivateMail(
      payload,
      new Uint8Array(f.payee.secret_key),
      { ...context, senderPublicKey: f.owner },
      f.source.id,
    );
    expect(opened?.letter.privatePayment).toEqual(f.request);
  } finally {
    f.cleanup();
  }
});
test("payment submits only after the unique recovery intent commits, and repeat clicks cannot pay twice", async () => {
  const f = fixture();
  try {
    const done = await payPrivateRequest(f.port, f.source, "30000");
    expect(done.alreadyDelivered).toBe(false);
    const calls = (f.port.confirmed as any).mock.invocationCallOrder,
      submit = (f.port.submit as any).mock.invocationCallOrder[0];
    expect(calls[0]).toBeLessThan(submit);
    expect(
      (await payPrivateRequest(f.port, f.source, "30000")).alreadyDelivered,
    ).toBe(true);
    expect(f.port.create).toHaveBeenCalledTimes(1);
    expect(f.port.submit).toHaveBeenCalledTimes(1);
    const persisted = JSON.stringify([...f.data]);
    expect(persisted).not.toContain(f.request.destination);
    expect(persisted).not.toContain(f.request.nonce);
    expect(persisted).not.toContain('"amount"');
  } finally {
    f.cleanup();
  }
});
test("lost payment response recovers the original submitted wallet result without another spend", async () => {
  const f = fixture();
  try {
    f.setLostSubmit();
    await expect(payPrivateRequest(f.port, f.source, "30000")).rejects.toThrow(
      "response lost",
    );
    await payPrivateRequest(f.port, f.source, "30000");
    expect(f.port.submit).toHaveBeenCalledTimes(1);
    expect(f.port.create).toHaveBeenCalledTimes(1);
  } finally {
    f.cleanup();
  }
});
test("receipt failure and browser storage loss recover from encrypted intent on chain", async () => {
  const f = fixture();
  try {
    f.setLostReceipt();
    await expect(payPrivateRequest(f.port, f.source, "30000")).rejects.toThrow(
      "receipt",
    );
    f.data.clear();
    f.setLostReceipt(false);
    await expect(payPrivateRequest(f.port, f.source, "99999")).rejects.toThrow(
      "original approval uses",
    );
    await payPrivateRequest(f.port, f.source, "30000");
    expect(f.port.submit).toHaveBeenCalledTimes(1);
    expect(f.port.create).toHaveBeenCalledTimes(1);
  } finally {
    f.cleanup();
  }
});
test("missing original request on a newly restored wallet blocks replacement instead of paying again", async () => {
  const f = fixture();
  try {
    f.setLostReceipt();
    await expect(
      payPrivateRequest(f.port, f.source, "30000"),
    ).rejects.toThrow();
    f.data.clear();
    f.port.inspect = vi.fn(async () => {
      throw Error("Original approval unavailable in this wallet installation");
    });
    await expect(payPrivateRequest(f.port, f.source, "30000")).rejects.toThrow(
      "unavailable",
    );
    expect(f.port.create).toHaveBeenCalledTimes(1);
    expect(f.port.submit).toHaveBeenCalledTimes(1);
  } finally {
    f.cleanup();
  }
});
test("lost creation, rejected approval, corrupt or unavailable browser journal never cause a replacement", async () => {
  for (const kind of ["lost", "rejected", "corrupt", "blocked"]) {
    const f = fixture();
    try {
      if (kind === "lost") f.setLostCreate();
      if (kind === "rejected") f.reject();
      if (kind === "corrupt")
        f.data.set("moonmail:private-payment-attempts:v1", "bad");
      if (kind === "blocked")
        f.port.storage.setItem = () => {
          throw Error("blocked");
        };
      await expect(
        payPrivateRequest(f.port, f.source, "30000"),
      ).rejects.toThrow();
      await expect(
        payPrivateRequest(f.port, f.source, "30000"),
      ).rejects.toThrow();
      expect(f.port.create).toHaveBeenCalledTimes(
        ["lost", "rejected"].includes(kind) ? 1 : 0,
      );
      expect(f.port.submit).not.toHaveBeenCalled();
    } finally {
      f.cleanup();
    }
  }
});
test("unconfirmed intent, occupied foreign record and participant mismatch prevent spending", async () => {
  for (const kind of ["unconfirmed", "occupied", "participant"]) {
    const f = fixture();
    try {
      if (kind === "unconfirmed")
        f.port.confirmed = vi.fn(async () => {
          throw Error("not confirmed");
        });
      if (kind === "occupied") {
        const id = await paymentLetterId(
          context,
          f.source.id,
          f.request,
          f.port.payer,
          "intent",
        );
        f.records.set(id, { ...f.source, id });
      }
      if (kind === "participant") f.source.message.recipient.postbox = "other";
      await expect(
        payPrivateRequest(f.port, f.source, "30000"),
      ).rejects.toThrow();
      expect(f.port.submit).not.toHaveBeenCalled();
    } finally {
      f.cleanup();
    }
  }
});
test("two browser installations can approve, but only the unique confirmed intent may submit funds", async () => {
  const f = fixture();
  try {
    let approvals = 0,
      release: () => void = () => {};
    const barrier = new Promise<void>((r) => {
      release = r;
    });
    const create = vi.fn(async () => {
      const id = `wallet-approval-${++approvals}`;
      if (approvals === 2) release();
      await barrier;
      return id;
    });
    const publish = f.port.publish;
    f.port.publish = vi.fn(async (id, payment, source) => {
      if (f.records.has(id)) throw Error("Duplicate immutable record");
      return publish(id, payment, source);
    });
    f.port.create = create;
    const other = {
      ...f.port,
      storage: { getItem: () => null, setItem: () => {} } as unknown as Storage,
    };
    const otherData = new Map<string, string>();
    other.storage = {
      getItem: (k) => otherData.get(k) ?? null,
      setItem: (k, v) => {
        otherData.set(k, v);
      },
    } as Storage;
    const settled = await Promise.allSettled([
      payPrivateRequest(f.port, f.source, "30000"),
      payPrivateRequest(other, f.source, "30000"),
    ]);
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(f.port.submit).toHaveBeenCalledTimes(1);
  } finally {
    f.cleanup();
  }
});
test("lost receipt response recovers its on-chain record without another native spend", async () => {
  const f = fixture();
  try {
    const original = f.port.publish;
    let lost = true;
    f.port.publish = vi.fn(async (id, payment, source) => {
      const tx = await original(id, payment, source);
      if (payment.kind === "receipt" && lost) {
        lost = false;
        throw Error("receipt response lost");
      }
      return tx;
    });
    await expect(payPrivateRequest(f.port, f.source, "30000")).rejects.toThrow(
      "response lost",
    );
    f.data.clear();
    expect(
      (await payPrivateRequest(f.port, f.source, "30000")).alreadyDelivered,
    ).toBe(true);
    expect(f.port.submit).toHaveBeenCalledTimes(1);
  } finally {
    f.cleanup();
  }
});
test("receiving binds invoice, intent, receipt, authenticated participants and deterministic IDs", async () => {
  const f = fixture();
  try {
    const done = await payPrivateRequest(f.port, f.source, "30000"),
      invoice = { ...structuredClone(f.source), inbox: false, sent: true };
    const intent = {
        ...structuredClone(f.records.get(done.receipt.intentLetter)!),
        inbox: true,
        sent: false,
      },
      receipt = {
        ...structuredClone(f.records.get(done.receiptId)!),
        inbox: true,
        sent: false,
      };
    expect(
      await verifyReceivedPayment(
        context,
        receipt,
        invoice,
        intent,
        f.owner,
        f.port.payer,
      ),
    ).toEqual(done.receipt);
    await expect(
      verifyReceivedPayment(
        context,
        receipt,
        invoice,
        intent,
        f.owner,
        "99".repeat(32),
      ),
    ).rejects.toThrow();
    const substituted = structuredClone(receipt);
    substituted.message.letter.privatePayment!.amount = "9999";
    await expect(
      verifyReceivedPayment(
        context,
        substituted,
        invoice,
        intent,
        f.owner,
        f.port.payer,
      ),
    ).rejects.toThrow();
    await expect(
      verifyReceivedPayment(
        { ...context, network: 36 },
        receipt,
        invoice,
        intent,
        f.owner,
        f.port.payer,
      ),
    ).rejects.toThrow();
  } finally {
    f.cleanup();
  }
});
test("pruned transaction history can only fall back to an existing unfrozen output, never a missing or frozen one", () => {
  expect(() =>
    verifyLivePaymentOutput({
      substate: { Utxo: { is_frozen: false, output: {} } },
    }),
  ).not.toThrow();
  for (const r of [
    {},
    { substate: { Utxo: { is_frozen: true, output: {} } } },
    { substate: { Utxo: { is_frozen: false } } },
  ])
    expect(() => verifyLivePaymentOutput(r)).toThrow();
});
test("receipt verification requires the exact output in the exact committed transaction", () => {
  const f = fixture();
  try {
    const receipt: PaymentReceipt = {
      ...f.request,
      kind: "receipt",
      requestLetter: f.source.id,
      intentLetter: "66".repeat(32),
      transactionId: "33".repeat(32),
      commitment: "44".repeat(32),
    };
    const actual = {
      result: {
        Finalized: {
          final_decision: "Commit",
          execution_result: {
            finalize: {
              result: {
                Accept: {
                  up_substates: [
                    [paymentOutputId(receipt), { substate: { Utxo: {} } }],
                  ],
                },
              },
            },
          },
        },
      },
    };
    expect(() => verifyPaymentOutput(receipt, actual)).not.toThrow();
    for (const changed of [
      { ...receipt, commitment: "77".repeat(32) },
      { ...receipt, resource: `resource_${"99".repeat(32)}` },
    ])
      expect(() => verifyPaymentOutput(changed, actual)).toThrow();
    expect(() =>
      verifyPaymentOutput(receipt, {
        result: { Finalized: { final_decision: "Abort" } },
      }),
    ).toThrow();
    expect(paymentMemo(receipt.intentLetter)).toBe(
      `mm-payment-1:${receipt.intentLetter}`,
    );
  } finally {
    f.cleanup();
  }
});
