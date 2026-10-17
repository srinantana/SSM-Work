"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { createProject, updateProject } from "../actions";
import { workTypes } from "@/lib/project-input";
import { SearchableSelect } from "@/components/searchable-select";
type Initial={id:string;revision:number;name:string;customer_key:string;quotation_ref:string;work_type:string;region:string;country:string;site:string;start_date:string;end_date:string;travel_days:number;notes:string};
type Customer={source_key:string;name:string};
export function ProjectForm({customers,requestId,initial}:{customers:Customer[];requestId:string;initial?:Initial}){
 const [values,setValues]=useState({name:initial?.name??"",customer_key:initial?.customer_key??"",quotation_ref:initial?.quotation_ref??"",work_type:initial?.work_type??"SERVICE",region:initial?.region??"DOMESTIC",country:initial?.country??"ไทย",site:initial?.site??"",start_date:initial?.start_date??"",end_date:initial?.end_date??"",travel_days:String(initial?.travel_days??0),notes:initial?.notes??""});
 const set=(name:keyof typeof values,value:string)=>setValues(v=>({...v,[name]:value}));
 const [state,action,pending]=useActionState(initial?updateProject.bind(null,initial.id):createProject,{error:null});
 const summary={name:values.name,customer:customers.find(c=>c.source_key===values.customer_key)?.name??"",start:values.start_date,end:values.end_date};
 return <form action={action} className="workspace-layout workspace-form"><input type="hidden" name="request_id" value={requestId}/>{initial&&<input type="hidden" name="revision" value={initial.revision}/>}
 <div className="editor-column"><section className="panel"><div className="panel-head"><h2>ข้อมูลโครงการ</h2><span className="small-label">01 / PROJECT DETAILS</span></div><div className="form-grid">
 <label className="wide">ชื่อโครงการ *<input name="name" value={values.name} onChange={e=>set("name",e.target.value)} required maxLength={160} placeholder="เช่น งานติดตั้งระบบ ณ โรงงานลูกค้า"/></label>
 <SearchableSelect name="customer_key" label="ลูกค้า" required options={customers.map(c=>({value:c.source_key,label:`${c.name} (${c.source_key})`}))} value={values.customer_key} onChange={v=>set("customer_key",v)}/>
 <label>เลขอ้างอิง IJ / JO / QJ<input name="quotation_ref" value={values.quotation_ref} onChange={e=>set("quotation_ref",e.target.value)} maxLength={80}/></label>
 <SearchableSelect name="work_type" label="ประเภทงาน" required options={Object.entries(workTypes).map(([value,label])=>({value,label}))} value={values.work_type} onChange={v=>set("work_type",v)}/>
 </div></section>
 <section className="panel"><div className="panel-head"><h2>สถานที่และช่วงเวลา</h2><span className="small-label">02 / WORKING PERIOD</span></div><div className="form-grid">
 <SearchableSelect name="region" label="พื้นที่" required options={[{value:"DOMESTIC",label:"ในประเทศ"},{value:"OVERSEAS",label:"ต่างประเทศ"}]} value={values.region} onChange={v=>set("region",v)}/>
 <label>ประเทศ *<input name="country" value={values.country} onChange={e=>set("country",e.target.value)} required maxLength={100}/><small className="muted">งานในประเทศบันทึกเป็นไทยเสมอ</small></label>
 <label className="wide">สถานที่ / Site *<input name="site" value={values.site} onChange={e=>set("site",e.target.value)} required maxLength={240}/></label>
 <label>วันที่เริ่มงาน *<input type="date" name="start_date" value={values.start_date} onChange={e=>set("start_date",e.target.value)} required min="2000-01-01" max="2100-12-31"/></label>
 <label>วันที่สิ้นสุด *<input type="date" name="end_date" value={values.end_date} onChange={e=>set("end_date",e.target.value)} required min="2000-01-01" max="2100-12-31"/></label>
 <label>วันเดินทาง (วัน)<input type="number" name="travel_days" value={values.travel_days} onChange={e=>set("travel_days",e.target.value)} required min="0" max="365" step="1"/></label>
 <label className="wide">หมายเหตุ<textarea name="notes" value={values.notes} onChange={e=>set("notes",e.target.value)} rows={3} maxLength={2000}/></label>
 </div></section>
 <section className="panel"><div className="panel-head"><h2>ค่าใช้จ่าย 6 หมวด</h2><span className="badge green">Estimate Studio</span></div><div className="cost-planned">{["Manpower","Subcontract","Accommodation","Travel","Transport","Site Expense"].map(label=><span key={label}>{label}</span>)}</div><p className="hint">{initial?"บันทึกข้อมูลโครงการ แล้วเปิดค่าใช้จ่ายเพื่อคำนวณจากข้อมูลล่าสุด":"สร้างโครงการก่อน แล้วเพิ่มรายการค่าใช้จ่ายพร้อมราคา Master ในขั้นถัดไป"}</p>{initial&&<Link className="button" href={`/projects/${initial.id}/expenses`}>เปิดค่าใช้จ่าย 6 หมวด →</Link>}</section></div>
 <aside className="summary-column"><section className="panel summary-panel"><div className="panel-head"><h2>สรุปโครงการ</h2><span className="badge neutral">DRAFT</span></div><div className="summary-row"><span>ชื่อโครงการ</span><b>{summary.name||"รอระบุ"}</b></div><div className="summary-row"><span>ลูกค้า</span><b>{summary.customer||"รอเลือก"}</b></div><div className="summary-row"><span>เริ่มงาน</span><b>{summary.start||"—"}</b></div><div className="summary-row"><span>สิ้นสุดงาน</span><b>{summary.end||"—"}</b></div><div className="grand-total"><span>Estimate รวม</span><b>—</b><small>THB · ดูยอดในหน้า Estimate Studio</small></div><div className="validation-box"><b>ก่อนบันทึก Draft</b><ul><li>กรอกชื่อโครงการและเลือกลูกค้า</li><li>ระบุ Site และช่วงเวลาทำงาน</li><li>ตรวจข้อมูลก่อนบันทึก</li></ul></div>
 {state.error&&<p className="error" role="alert">{state.error}</p>}
 <button className="button primary full" disabled={pending||!customers.length}>{pending?"กำลังบันทึก…":initial?"บันทึกการแก้ไข Draft":"สร้างโครงการ Draft"}</button><Link className="button full" href="/projects">ยกเลิก / กลับรายการ</Link><p className="hint">บันทึกใน Supabase · เห็นเฉพาะผู้สร้างที่มีสิทธิ์ ยังไม่ส่งอนุมัติ</p></section><section className="panel compact-panel"><h3>Flow เดิม</h3><p>Draft → SSM Review → MD Approval → Actual / Clearing</p><span className="badge amber">ขณะนี้เปิดใช้ Draft</span></section></aside>
 </form>;
}
