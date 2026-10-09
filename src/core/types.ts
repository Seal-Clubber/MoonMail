export type MailMode = "public" | "link" | "postbox";
export interface Context {
  network: number;
  registry: string;
  template: string;
}
export interface ReplyThread {
  version: "gd-thread-1";
  root: string;
  parent: string;
}
export interface Letter {
  thread?: ReplyThread;
  subject: string;
  body: string;
}
export interface SentCopy {
  version: "gd-sent-1";
  postbox: string;
  controller: string;
  payload: MailboxPayload;
}
export interface SealedPayload {
  sent?: SentCopy;
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
export interface CapsuleReference {
  resource: string;
  commitment: string;
}
export interface CapsuleDeployment {
  template: string;
  component: string;
  resource: string;
}
export interface MailboxKey {
  version: "gd-postbox-1";
  keyVersion: number;
  publicKey: string;
  recovery?: "native-memo-1" | "sapient-capsule-1";
  capsule?: CapsuleReference;
}
export interface MailboxPayload {
  sent?: SentCopy;
  version: "gd-postbox-1";
  keyVersion: number;
  recipientKey: string;
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
  recovery?: "native-memo-1" | "sapient-capsule-1";
  capsule?: CapsuleReference;
}
export interface Envelope {
  claimProtocol?: "sapient-proof-1";
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
  contractProtocol?: "unified-1";
  postboxClaimProtocol?: "sapient-proof-1";
  capsule?: CapsuleDeployment;
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
    postboxClaims?: boolean;
    mailboxState?: boolean;
  };
}
