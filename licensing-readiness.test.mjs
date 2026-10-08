import test from 'node:test';
import assert from 'node:assert/strict';
import {planReadiness} from './licensing-readiness.mjs';
const base={ok:true,enforcementActive:false,usage:{users:{count:1,limit:2},employees:{count:4,limit:5},invoicesPerMonth:{count:null,limit:25}}};
test('warns at 80 percent without enforcing',()=>{const r=planReadiness(base);assert.equal(r.ready,false);assert.equal(r.enforcementActive,false);assert.equal(r.signals.find(s=>s.key==='employees').state,'approaching');assert.equal(r.signals.find(s=>s.key==='invoicesPerMonth').state,'unverified')});
test('identifies at limit without blocking',()=>{const r=planReadiness({ok:true,enforcementActive:false,usage:{users:{count:2,limit:2}}});assert.equal(r.signals[0].state,'at_limit');assert.equal(r.enforcementActive,false)});
test('unlimited plans are not restricted',()=>{const r=planReadiness({ok:true,enforcementActive:false,usage:{users:{count:null,limit:null}}});assert.equal(r.signals[0].state,'unlimited')});
test('rejects unverified and enforcement-active snapshots',()=>{assert.equal(planReadiness(null).ready,false);assert.equal(planReadiness({ok:true,enforcementActive:true}).ready,false)});