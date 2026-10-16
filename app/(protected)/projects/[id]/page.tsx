import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTrialAccess } from "@/lib/trial";
import { workTypes } from "@/lib/project-input";
export default async function Project({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const {user,supabase}=await requireTrialAccess();
 const {data:p,error}=await supabase.from("ssm_projects").select("*").eq("id",id).eq("owner_id",user.id).maybeSingle();
 if(error)throw new Error("อ่านโครงการไม่ได้ กรุณาลองใหม่");if(!p)notFound();
 const {data:customer}=await supabase.from("ssm_trial_customers").select("name").eq("batch_id",p.batch_id).eq("source_key",p.customer_key).maybeSingle();
 const fields=[["เลขโครงการ",p.project_no],["ลูกค้า",customer?.name??p.customer_key],["เลขอ้างอิง",p.quotation_ref||"—"],["ประเภทงาน",workTypes[p.work_type]],["พื้นที่",p.region==="DOMESTIC"?"ในประเทศ":"ต่างประเทศ"],["ประเทศ",p.country],["Site",p.site],["วันที่เริ่มงาน",p.start_date],["วันที่สิ้นสุด",p.end_date],["วันเดินทาง",`${p.travel_days} วัน`]];
 return <><Link href="/projects">← โครงการของฉัน</Link><p className="eyebrow">PROJECT · DRAFT</p><h1>{p.name}</h1><p className="muted">บันทึกโครงการใน Supabase แล้ว · สถานะ Draft</p><section className="notice"><h2>ข้อมูลโครงการ</h2><dl className="detail-grid">{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{p.notes&&<><h3>หมายเหตุ</h3><p className="preserve-lines">{p.notes}</p></>}</section><section className="notice"><h2>ค่าใช้จ่ายโครงการ</h2><p>ยังไม่มีรายการค่าใช้จ่าย โมดูลบันทึกค่าใช้จ่ายและส่งอนุมัติจะเพิ่มในขั้นถัดไป</p><Link href="/dashboard">เปิด Master และเครื่องคำนวณทดลอง →</Link><p className="hint">ผลคำนวณทดลองยังไม่ได้บันทึกเป็นค่าใช้จ่ายของโครงการนี้</p></section><div className="project-actions"><Link href="/projects">ดูโครงการทั้งหมด</Link><Link className="button-link" href="/projects/new">สร้างโครงการถัดไป</Link></div></>;
}
