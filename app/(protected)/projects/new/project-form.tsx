"use client";
import { useActionState } from "react";
import Link from "next/link";
import { createProject } from "../actions";
import { workTypes } from "@/lib/project-input";
type Customer={source_key:string;name:string};
export function ProjectForm({customers,requestId}:{customers:Customer[];requestId:string}){
 const [state,action,pending]=useActionState(createProject,{error:null});
 return <form action={action} className="project-form"><input type="hidden" name="request_id" value={requestId}/>
 <section className="notice"><h2>1. ข้อมูลโครงการ</h2><div className="form-grid">
 <label className="wide">ชื่อโครงการ *<input name="name" required maxLength={160} placeholder="เช่น งานติดตั้งระบบ ณ โรงงานลูกค้า"/></label>
 <label>ลูกค้า *<select name="customer_key" required defaultValue=""><option value="" disabled>เลือกลูกค้าจาก Master</option>{customers.map(c=><option key={c.source_key} value={c.source_key}>{c.name} ({c.source_key})</option>)}</select></label>
 <label>เลขที่ใบเสนอราคา / อ้างอิง<input name="quotation_ref" maxLength={80}/></label>
 <label>ประเภทงาน *<select name="work_type" required defaultValue="SERVICE">{Object.entries(workTypes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
 </div></section>
 <section className="notice"><h2>2. สถานที่และช่วงเวลา</h2><div className="form-grid">
 <label>พื้นที่ *<select name="region" required defaultValue="DOMESTIC"><option value="DOMESTIC">ในประเทศ</option><option value="OVERSEAS">ต่างประเทศ</option></select></label>
 <label>ประเทศ *<input name="country" required defaultValue="ไทย" maxLength={100}/><small className="muted">งานในประเทศบันทึกเป็นไทยเสมอ</small></label>
 <label className="wide">สถานที่ / Site *<input name="site" required maxLength={240}/></label>
 <label>วันที่เริ่มงาน *<input type="date" name="start_date" required min="2000-01-01" max="2100-12-31"/></label>
 <label>วันที่สิ้นสุด *<input type="date" name="end_date" required min="2000-01-01" max="2100-12-31"/></label>
 <label>วันเดินทาง (วัน)<input type="number" name="travel_days" required min="0" max="365" step="1" defaultValue="0"/></label>
 <label className="wide">หมายเหตุ<textarea name="notes" rows={3} maxLength={2000}/></label>
 </div></section>
 <p className="hint">บันทึกเป็น Draft ก่อน ยังไม่ส่งอนุมัติและยังไม่รวมรายการค่าใช้จ่าย โครงการจะเห็นเฉพาะบัญชีผู้สร้างที่ยังมีสิทธิ์ใช้งาน</p>
 {state.error&&<p className="error" role="alert">{state.error}</p>}
 <div className="project-actions"><Link href="/projects">ยกเลิก</Link><button disabled={pending||!customers.length}>{pending?"กำลังบันทึก…":"สร้างโครงการ Draft"}</button></div>
 </form>;
}
