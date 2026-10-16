"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { createProject } from "../actions";
import { workTypes } from "@/lib/project-input";
type Customer={source_key:string;name:string};
export function ProjectForm({customers,requestId}:{customers:Customer[];requestId:string}){
 const [state,action,pending]=useActionState(createProject,{error:null});
 const [summary,setSummary]=useState({name:"",customer:"",start:"",end:""});
 return <form action={action} className="workspace-layout workspace-form" onChange={e=>{const f=new FormData(e.currentTarget);setSummary({name:String(f.get("name")??""),customer:customers.find(c=>c.source_key===f.get("customer_key"))?.name??"",start:String(f.get("start_date")??""),end:String(f.get("end_date")??"")});}}><input type="hidden" name="request_id" value={requestId}/>
 <div className="editor-column"><section className="panel"><div className="panel-head"><h2>ข้อมูลโครงการ</h2><span className="small-label">01 / PROJECT DETAILS</span></div><div className="form-grid">
 <label className="wide">ชื่อโครงการ *<input name="name" required maxLength={160} placeholder="เช่น งานติดตั้งระบบ ณ โรงงานลูกค้า"/></label>
 <label>ลูกค้า *<select name="customer_key" required defaultValue=""><option value="" disabled>เลือกลูกค้าจาก Master</option>{customers.map(c=><option key={c.source_key} value={c.source_key}>{c.name} ({c.source_key})</option>)}</select></label>
 <label>เลขอ้างอิง IJ / JO / QJ<input name="quotation_ref" maxLength={80}/></label>
 <label>ประเภทงาน *<select name="work_type" required defaultValue="SERVICE">{Object.entries(workTypes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
 </div></section>
 <section className="panel"><div className="panel-head"><h2>สถานที่และช่วงเวลา</h2><span className="small-label">02 / WORKING PERIOD</span></div><div className="form-grid">
 <label>พื้นที่ *<select name="region" required defaultValue="DOMESTIC"><option value="DOMESTIC">ในประเทศ</option><option value="OVERSEAS">ต่างประเทศ</option></select></label>
 <label>ประเทศ *<input name="country" required defaultValue="ไทย" maxLength={100}/><small className="muted">งานในประเทศบันทึกเป็นไทยเสมอ</small></label>
 <label className="wide">สถานที่ / Site *<input name="site" required maxLength={240}/></label>
 <label>วันที่เริ่มงาน *<input type="date" name="start_date" required min="2000-01-01" max="2100-12-31"/></label>
 <label>วันที่สิ้นสุด *<input type="date" name="end_date" required min="2000-01-01" max="2100-12-31"/></label>
 <label>วันเดินทาง (วัน)<input type="number" name="travel_days" required min="0" max="365" step="1" defaultValue="0"/></label>
 <label className="wide">หมายเหตุ<textarea name="notes" rows={3} maxLength={2000}/></label>
 </div></section>
 <section className="panel"><div className="panel-head"><h2>ค่าใช้จ่าย 6 หมวด</h2><span className="badge amber">ขั้นถัดไป</span></div><div className="cost-planned">{["Labor / Allowance","Accommodation","Transport","Travel","Logistics","Other"].map(label=><span key={label}>{label}</span>)}</div><div className="empty-lines">บันทึกข้อมูลโครงการก่อน · การเพิ่มค่าใช้จ่ายรายโครงการยังไม่เปิดใช้</div><div className="section-footer"><Link className="text-button" href="/master">ค้นหา Master และทดลองคำนวณ →</Link><b>— THB</b></div></section></div>
 <aside className="summary-column"><section className="panel summary-panel"><div className="panel-head"><h2>สรุปโครงการ</h2><span className="badge neutral">DRAFT</span></div><div className="summary-row"><span>ชื่อโครงการ</span><b>{summary.name||"รอระบุ"}</b></div><div className="summary-row"><span>ลูกค้า</span><b>{summary.customer||"รอเลือก"}</b></div><div className="summary-row"><span>เริ่มงาน</span><b>{summary.start||"—"}</b></div><div className="summary-row"><span>สิ้นสุดงาน</span><b>{summary.end||"—"}</b></div><div className="grand-total"><span>Estimate รวม</span><b>—</b><small>THB · ยังไม่มีรายการค่าใช้จ่ายของโครงการ</small></div><div className="validation-box"><b>ก่อนบันทึก Draft</b><ul><li>กรอกชื่อโครงการและเลือกลูกค้า</li><li>ระบุ Site และช่วงเวลาทำงาน</li><li>ตรวจข้อมูลก่อนบันทึก</li></ul></div>
 {state.error&&<p className="error" role="alert">{state.error}</p>}
 <button className="button primary full" disabled={pending||!customers.length}>{pending?"กำลังบันทึก…":"สร้างโครงการ Draft"}</button><Link className="button full" href="/projects">ยกเลิก / กลับรายการ</Link><p className="hint">บันทึกใน Supabase · เห็นเฉพาะผู้สร้างที่มีสิทธิ์ ยังไม่ส่งอนุมัติ</p></section><section className="panel compact-panel"><h3>Flow เดิม</h3><p>Draft → SSM Review → MD Approval → Actual / Clearing</p><span className="badge amber">ขณะนี้เปิดใช้ Draft</span></section></aside>
 </form>;
}
