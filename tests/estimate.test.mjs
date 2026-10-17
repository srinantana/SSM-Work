import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendar,decimal,resolveLine,summarize,rateSection} from '../lib/estimate.ts';
const settings={people:'3',rooms:'2',vehicles:'1',start_date:'2026-10-17',end_date:'2026-10-19',travel_days:2,pricing_date:'2026-10-17'};
const rate={id:'rate1',source_key:'LEG-ALL-76',version_key:'v1',category:'ALLOWANCE',unit:'person/day',name:'Allowance',amount:150,currency:'THB',valid_from:'2026-01-01',valid_to:'2027-12-31'};
function line(patch={}){return {id:'line1',section:'manpower',name:'Allowance',unit:'person/day',quantity_mode:'auto',quantity:'1',period_mode:'auto',periods:'1',rate_mode:'master',rate_id:'rate1',rate:'',reason:'',notes:'',...patch};}
test('calendar counts inclusive days and elapsed nights including leap day and same-day work',()=>{
 assert.deepEqual(calendar('2026-10-17','2026-10-17'),{days:1,nights:0});
 assert.deepEqual(calendar('2028-02-28','2028-03-01'),{days:3,nights:2});
});
test('shared people and project calendar calculate allowance without charging travel days implicitly',()=>{
 const x=resolveLine(line(),settings,[rate]);assert.equal(x.cents,135000n);assert.equal(x.periods,'3');assert.equal(x.quantity,'3');
});
test('hotel uses rooms times elapsed nights; quantity and period overrides are respected',()=>{
 const hotel=line({section:'accommodation',name:'Hotel',unit:'room/night',rate_id:'',rate_mode:'manual',rate:'1200',reason:'Hotel quote'});
 assert.equal(resolveLine(hotel,settings,[]).cents,480000n);
 assert.equal(resolveLine({...hotel,quantity_mode:'manual',quantity:'3',period_mode:'manual',periods:'4'},settings,[]).cents,1440000n);
});
test('round trip is charged per round trip without an extra return multiplier; half days are explicit periods',()=>{
 const trip=line({section:'transport',unit:'vehicle/round trip',period_mode:'manual',periods:'1',rate_mode:'manual',rate_id:'',rate:'1000',reason:'Quote'});
 assert.equal(resolveLine(trip,settings,[]).cents,100000n);
 const half=line({section:'subcontract',unit:'person/half day',period_mode:'manual',periods:'2',rate_mode:'manual',rate_id:'',rate:'2000',reason:'Quote'});
 assert.equal(resolveLine(half,settings,[]).cents,1200000n);
});
test('decimal money rounds half-up once per line without binary floating-point drift',()=>{
 assert.equal(decimal('1e2'),null);assert.equal(decimal('-1'),null);assert.equal(decimal('0.0000001'),null);
 const x=line({unit:'lot',quantity_mode:'manual',quantity:'1',period_mode:'manual',periods:'1',rate_mode:'manual',rate_id:'',rate:'1.005',reason:'Quote'});
 assert.equal(resolveLine(x,settings,[]).cents,101n);
 assert.equal(resolveLine({...x,quantity:'3',rate:'0.1'},settings,[]).cents,30n);
});
test('unavailable or expired Master, missing prices and unexplained overrides remain incomplete',()=>{
 for(const [l,s,rates] of [[line(),{...settings,pricing_date:'2028-01-01'},[rate]],[line(),settings,[]],[line({rate_mode:'manual',rate:'100',reason:''}),settings,[rate]],[line({rate_mode:'manual',rate:'',reason:'Quote'}),settings,[rate]]])assert.equal(resolveLine(l,s,rates).cents,null);
 assert.equal(resolveLine(line(),{...settings,pricing_date:'2027-12-31'},[rate]).cents,135000n);
});
test('excluded category preserves lines without inflating totals or incomplete count',()=>{
 const doc={settings,included:{manpower:true,accommodation:false,transport:true,travel:true,subcontract:true,site_expense:true},lines:[line(),line({id:'other',section:'accommodation',rate_id:'',rate_mode:'manual',rate:''})]};
 const x=summarize(doc,[rate]);assert.equal(x.cents,135000n);assert.equal(x.pending,0);assert.equal(doc.lines.length,2);
});
test('source categories map to original V02 sections including ground transport and installation subcontract',()=>{
 assert.equal(rateSection({category:'TRAVEL',unit:'vehicle/round trip',source_key:'x'}),'transport');
 assert.equal(rateSection({category:'OTHER',unit:'person/day',source_key:'LEG-ADD-INSTALL-DAY'}),'subcontract');
});
