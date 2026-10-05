import type { Envelope } from '../src/core/types';
export interface KeeperConfig {target:number;buffer:number;gift:string;reserve:string;publicationCap:string;budget:string;campaign:string;concurrency:number}
export interface Reservation {envelopeId:string;cost:string;txId?:string;state:'prepared'|'pending'|'unknown'|'confirmed'|'rejected'}
export interface Journal {context?:string;reservations:Reservation[]}
export function validateKeeper(c:KeeperConfig){if(!Number.isInteger(c.target)||c.target<5||!Number.isInteger(c.buffer)||c.buffer<0||!Number.isInteger(c.concurrency)||c.concurrency<1||c.concurrency>4||!c.campaign||c.campaign.length>80)throw new Error('Target >=5, buffer >=0, concurrency 1..4 and bounded campaign required');for(const v of [c.gift,c.reserve,c.publicationCap,c.budget])if(!/^\d+$/.test(v)||BigInt(v)<=0n||BigInt(v)>18446744073709551615n)throw new Error('Positive whole u64 microTARI amounts required');}
export function planRefill(c:KeeperConfig,journal:Journal,letters:Envelope[]){
  validateKeeper(c);
  const claimable=letters.filter(e=>e.mode==='public'&&e.campaign===c.campaign&&!e.claimed&&BigInt(e.gift)>=BigInt(c.gift)&&BigInt(e.reserve)>=BigInt(c.reserve)).length;
  const outstanding=journal.reservations.filter(r=>['prepared','pending','unknown'].includes(r.state));
  const spent=journal.reservations.filter(r=>r.state!=='rejected').reduce((sum,r)=>sum+BigInt(r.cost),0n);
  const cost=BigInt(c.gift)+BigInt(c.reserve)+BigInt(c.publicationCap),remaining=BigInt(c.budget)-spent;
  const desired=Math.max(0,c.target+c.buffer-claimable-outstanding.length);
  // Unknown submissions consume their reservation and block replacement; fee failures
  // are never released unless both final outcome and actual costs are reconciled.
  const count=Math.max(0,Math.min(desired,c.concurrency,Number(remaining>0n?remaining/cost:0n)));
  return {claimable,outstanding:outstanding.length,remaining:remaining.toString(),cost:cost.toString(),count};
}
