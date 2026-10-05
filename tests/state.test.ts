import { it,expect } from 'vitest';
import { claimTransaction,publishTransaction,money } from '../src/core/transactions';
import { emptyDeployment,writesReady,endpoint } from '../src/core/config';
import { decodeOffice,decodeEnvelope } from '../src/core/chain';
import { savePending,hasUnresolved,beginSubmission,completeSubmission,readPending } from '../src/core/pending';
import fixture from './fixtures/engine-office.json';
import { sealLetter } from '../src/core/crypto';
const d={...emptyDeployment,registry:`component_${'a'.repeat(64)}`,template:'b'.repeat(64),resource:`resource_${'c'.repeat(64)}`};
it('builds one bounded atomic fee-stage claim with no wallet payer/main instructions',()=>{const tx=claimTransaction(d,'id',`component_${'d'.repeat(64)}`,100);expect(tx.instructions).toEqual([]);expect(tx.fee_instructions).toHaveLength(1);expect(tx.network).toBe(16);expect(tx.max_epoch).toBe(110);expect(JSON.stringify(tx)).toContain('claim_and_pay_fee');});
it('destination and network alter the signed transaction content',()=>{const a=claimTransaction(d,'id',`component_${'d'.repeat(64)}`,100),b=claimTransaction(d,'id',`component_${'e'.repeat(64)}`,100);expect(a).not.toEqual(b);expect(a).not.toEqual(claimTransaction({...d,network:38},'id',`component_${'d'.repeat(64)}`,100));});
it('builds publication with full ciphertext and exact funding, no secret',async()=>{const s=await sealLetter({subject:'private',body:'secret'},d,'id');const tx=publishTransaction(d,{id:'id',mode:'link',context:d,payload:s.payload,gift:'100',reserve:'5',claimed:false,sender:''},`component_${'e'.repeat(64)}`,'1000',100);expect(tx.instructions).toHaveLength(3);expect(tx.fee_instructions).toHaveLength(1);expect(JSON.stringify(tx)).not.toContain(s.capability);expect(tx.instructions.at(-1)).toHaveProperty('CallMethod.method','publish');});
it('production gates fail closed',()=>{expect(writesReady(d)).toBe(false);expect(()=>endpoint('http://remote.example')).toThrow();expect(()=>endpoint('https://name:password@example.test')).toThrow();expect(endpoint('http://localhost:5100/json_rpc',true)).toContain('localhost');});
it('never converts large money through floating-point and rejects invalid/overflow amounts',()=>{expect(money('9007199254740993')).toBe(9007199254740993n);for(const v of ['-1','1.5','1e6','18446744073709551616'])expect(()=>money(v)).toThrow();});
it('decodes isolated envelope state and rejects wrong network or unrepresentable amounts',()=>{const e=[16,'id',0,JSON.stringify({subject:'hello',body:'world'}),100,5,false,null,'','',{'@cbor':'bytes',hex:'a'.repeat(64)},'campaign',null,null];expect(decodeEnvelope(e,d,'id',d.registry).gift).toBe('100');expect(()=>decodeEnvelope([38,...e.slice(1)],d,'id',d.registry)).toThrow('network');expect(()=>decodeEnvelope([...e.slice(0,4),9007199254740994,...e.slice(5)],d,'id',d.registry)).toThrow();});
it('persists only public pending IDs and prevents duplicate retries after unknown outcome',()=>{const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>{values.set(k,v);}};savePending(storage,{id:'tx',network:16,registry:d.registry,envelopeId:'e',operation:'publish',state:'unknown'});expect(hasUnresolved(storage,16,d.registry,'e')).toBe(true);expect(hasUnresolved(storage,38,d.registry,'e')).toBe(false);savePending(storage,{id:'tx',network:16,registry:d.registry,envelopeId:'e',operation:'publish',state:'confirmed'});expect(hasUnresolved(storage,16,d.registry,'e')).toBe(false);});
it('decodes actual Rust engine component state without synthetic state assumptions',()=>{
  const deployment={...d,registry:fixture.registry,template:fixture.template,envelopeTemplate:fixture.envelopeTemplate};
  const office=decodeOffice(fixture.component.body.state,deployment);expect(office.letterRefs).toHaveLength(1);
  const [component,state]=Object.entries(fixture.envelopes)[0];const letter=decodeEnvelope(state.body.state,deployment,'gift',component);
  expect(letter.payload).toEqual({subject:'hello',body:'world'});expect(letter.gift).toBe('1000000');expect(letter.claimed).toBe(false);
  expect(()=>decodeOffice(fixture.component.body.state,{...deployment,envelopeTemplate:'wrong'})).toThrow();
});
it('records uncertainty before broadcast, survives restart and replaces only after receipt',()=>{
  const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>{values.set(k,v);}};
  const attempt=beginSubmission(storage,{network:16,registry:d.registry,envelopeId:'timeout',operation:'claim'});
  expect(hasUnresolved(storage,16,d.registry,'timeout')).toBe(true);expect(readPending(storage)[0].state).toBe('unknown');
  completeSubmission(storage,attempt,'returned-tx');expect(readPending(storage)).toHaveLength(1);expect(readPending(storage)[0]).toMatchObject({id:'returned-tx',state:'submitted'});
});
