import { blake2b } from "@noble/hashes/blake2.js";
import { parseOotleAddress } from "@tari-project/ootle-wasm";
import { hex } from "./crypto";

/** Canonical built-in Account identity, matching Ootle's engine derivation.
 * DomainSeparatedBorshHasher: u64-le tag length, tag, fixed template hash,
 * then the Borsh public-key byte vector (u32-le length followed by 32 bytes).
 * Only public address material is hashed; no wallet permission is required.
 */
export function accountForOwner(owner: Uint8Array) {
  if (owner.length !== 32) throw new Error("Invalid account public key");
  const tag = new TextEncoder().encode(
    "com.tari.ootle.engine.v0.ComponentAddress",
  );
  const length = new Uint8Array(8);
  new DataView(length.buffer).setBigUint64(0, BigInt(tag.length), true);
  const hash = blake2b
    .create({ dkLen: 32 })
    .update(length)
    .update(tag)
    .update(new Uint8Array(32))
    .update(new Uint8Array([32, 0, 0, 0]))
    .update(owner)
    .digest();
  return `component_${hex(hash)}`;
}

export function receivingAddress(value: string, network: number) {
  const address = value.trim();
  let parsed;
  try {
    parsed = parseOotleAddress(address);
  } catch {
    throw new Error(
      "Enter a valid Ootle wallet address, copied from your wallet.",
    );
  }
  try {
    if (parsed.network !== network)
      throw new Error(
        "This wallet address is for another network. Use an address on this post office’s network.",
      );
    if (parsed.memo?.length)
      throw new Error(
        "Use your plain Ootle wallet address without a payment reference.",
      );
    return {
      address,
      owner: hex(parsed.owner_key),
      destination: accountForOwner(parsed.owner_key),
    };
  } finally {
    parsed.free();
  }
}
