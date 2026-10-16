import {test} from "node:test";
import assert from "node:assert/strict";
import {projectInput} from "../lib/project-input.ts";
function form(patch={}){const f=new FormData();for(const [k,v] of Object.entries({name:"โครงการทดสอบ",customer_key:"CUSTOMER-1",quotation_ref:"",work_type:"SERVICE",region:"DOMESTIC",country:"ไทย",site:"กรุงเทพ",start_date:"2026-10-16",end_date:"2026-10-20",travel_days:"0",notes:"",...patch}))f.set(k,v);return f;}
test("project rejects impossible and reversed dates",()=>{for(const patch of [{start_date:"2026-02-30"},{end_date:"2026-10-15"},{end_date:"9999-01-01"}])assert.throws(()=>projectInput(form(patch)));});
test("project requires customer and site and restricts type and travel days",()=>{for(const patch of [{customer_key:""},{site:""},{name:" "},{work_type:"ADMIN"},{travel_days:"1.5"},{travel_days:"-1"},{travel_days:"366"},{name:"x".repeat(161)}])assert.throws(()=>projectInput(form(patch)));});
test("project normalizes domestic country and trims input without accepting ownership or status",()=>{const input=projectInput(form({name:" งานใหม่ ",country:"other",owner_id:"other",status:"APPROVED"}));assert.equal(input.name,"งานใหม่");assert.equal(input.country,"ไทย");assert.equal(input.travel_days,0);assert.ok(!("owner_id" in input));assert.ok(!("status" in input));});
