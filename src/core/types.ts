export type MailMode = "public" | "link" | "postbox";
export interface Context {
  network: number;
  registry: string;
  template: string;
}
export interface Letter {
  subject: string;
  body: string;
}
export interface SealedPayload {
  version: "gd-link-1";
  iv: string;
  ciphertext: string;
  wrapIv: string;
  wrappedClaimKey: string;
  claimPublicKey: string;
}
export interface MailboxContext extends Context {
  postbox: string;
  controller: string;
  keyVersion: number;
}
export interface MailboxKey {
  version: "gd-postbox-1";
  keyVersion: number;
  publicKey: string;
  recovery?: "native-memo-1";
}
export interface MailboxPayload {
  version: "gd-postbox-1";
  keyVersion: number;
  recipientKey: string;
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
  recovery?: "native-memo-1";
}
export interface Envelope {
  component?: string;
  id: string;
  mode: MailMode;
  context: Context;
  payload: Letter | SealedPayload | MailboxPayload;
  gift: string;
  reserve: string;
  claimed: boolean;
  recipientPostbox?: string;
  claimAuthority?: string;
  replyPostbox?: string;
  campaign?: string;
  sender: string;
}
export interface Postbox {
  id: string;
  nickname: string;
  controller: string;
  encryptionKey: string;
  discoverable: boolean;
}
export interface Deployment extends Context {
  envelopeTemplate: string;
  indexerUrl: string;
  resource: string;
  // Evidence file is reviewed by the operator; this is a UI interlock, not an on-chain security boundary.
  evidence: {
    engineClaims: boolean;
    guestPayout: boolean;
    guestAccountCreation?: boolean;
    daemonScopes: boolean;
    httpsWallet: boolean;
    mailboxRecovery: boolean;
    sapientWallet?: boolean;
  };
}
