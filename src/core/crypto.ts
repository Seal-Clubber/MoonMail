import type { Context, Letter, SealedPayload } from './types';
const te = new TextEncoder();
export const hex = (v: Uint8Array) => Array.from(v, n => n.toString(16).padStart(2, '0')).join('');
export function unhex(v: string) { if (!/^(?:[0-9a-f]{2})+$/i.test(v)) throw new Error('Invalid hex'); return Uint8Array.from(v.match(/../g)!, x => parseInt(x, 16)); }
export function base64url(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, ''); }
export function fromBase64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Malformed capability');
  return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
}
const buf = (v: Uint8Array) => new Uint8Array(v).buffer;
function aad(context: Context, id: string, purpose: string) { return te.encode(JSON.stringify(['GhostDrop', 'gd-link-1', context.network, context.registry, context.template, id, purpose])); }
async function key(root: Uint8Array, context: Context, id: string, purpose: string) {
  const material = await crypto.subtle.importKey('raw', buf(root), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: buf(aad(context,id,'salt')), info: buf(aad(context,id,purpose)) }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
}
export function assertEnvelopeSize(payload: unknown) {
  if (te.encode(JSON.stringify(payload)).byteLength > 4096) throw new Error('The complete letter envelope must fit within 4 KiB. Shorten your message.');
}
export async function sealLetter(letter: Letter, context: Context, id: string) {
  const { generateKeypair } = await import('@tari-project/ootle-wasm');
  const pair = generateKeypair();
  const claimSecret = new Uint8Array(pair.secret_key), claimPublicKey = hex(pair.public_key); pair.free();
  const root = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12)), wrapIv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const ciphertext = await crypto.subtle.encrypt({ name:'AES-GCM', iv:buf(iv), additionalData:buf(aad(context,id,'letter')) }, await key(root,context,id,'letter'), te.encode(JSON.stringify(letter)));
    const wrappedClaimKey = await crypto.subtle.encrypt({ name:'AES-GCM', iv:buf(wrapIv), additionalData:buf(aad(context,id,'claim-wrap')) }, await key(root,context,id,'claim-wrap'), buf(claimSecret));
    const payload: SealedPayload = {version:'gd-link-1',iv:base64url(iv),ciphertext:base64url(new Uint8Array(ciphertext)),wrapIv:base64url(wrapIv),wrappedClaimKey:base64url(new Uint8Array(wrappedClaimKey)),claimPublicKey};
    assertEnvelopeSize(payload);
    return { payload, capability: base64url(root) };
  } finally { root.fill(0); claimSecret.fill(0); }
}
export async function openLetter(payload: SealedPayload, capability: string, context: Context, id: string) {
  if (payload.version !== 'gd-link-1') throw new Error('Unsupported encryption version');
  assertEnvelopeSize(payload);
  const root = fromBase64url(capability);
  if (root.length !== 32 || base64url(root) !== capability) throw new Error('The link requires a canonical 256-bit capability');
  try {
    const decrypt = async (purpose: string, iv: string, data: string) => crypto.subtle.decrypt({name:'AES-GCM',iv:buf(fromBase64url(iv)),additionalData:buf(aad(context,id,purpose))},await key(root,context,id,purpose),buf(fromBase64url(data)));
    const plain = await decrypt('letter',payload.iv,payload.ciphertext);
    const letter: unknown = JSON.parse(new TextDecoder().decode(plain));
    if (!letter || typeof letter !== 'object' || typeof (letter as Letter).subject !== 'string' || typeof (letter as Letter).body !== 'string') throw new Error('Invalid letter');
    const claimSecret = new Uint8Array(await decrypt('claim-wrap',payload.wrapIv,payload.wrappedClaimKey));
    const { publicKeyFromSecretKey } = await import('@tari-project/ootle-wasm');
    if (hex(publicKeyFromSecretKey(claimSecret)) !== payload.claimPublicKey) { claimSecret.fill(0); throw new Error('Claim authority does not match ciphertext'); }
    return { letter: letter as Letter, claimSecret };
  } finally { root.fill(0); }
}
