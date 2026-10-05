import type { Deployment } from './types';
export const emptyDeployment: Deployment = {network:16,registry:'',template:'',envelopeTemplate:'',indexerUrl:'',resource:'',evidence:{engineClaims:false,guestPayout:false,daemonScopes:false,httpsWallet:false,mailboxRecovery:false}};
export function writesReady(d: Deployment, mode: 'public'|'link'|'postbox' = 'link') {
  return !!d.registry && !!d.template && !!d.envelopeTemplate && !!d.resource && d.evidence.engineClaims && d.evidence.guestPayout && d.evidence.daemonScopes && d.evidence.httpsWallet && (mode !== 'postbox' || d.evidence.mailboxRecovery);
}
export function endpoint(value: string, local = false) {
  const u = new URL(value);
  if (u.username || u.password || u.hash || u.search) throw new Error('Endpoints cannot contain credentials, queries or fragments');
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname))) throw new Error('Use HTTPS, or HTTP loopback for a local daemon/localnet');
  return u.href;
}
