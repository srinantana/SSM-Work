import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireTrialAccess } from "@/lib/trial";
import { ProjectForm } from "./project-form";
export default async function NewProject(){
 const {supabase,batches}=await requireTrialAccess();
 const {data,error}=await supabase.from("ssm_trial_customers").select("source_key,name").eq("batch_id",batches[0].id).order("name");
 if(error)throw new Error("โหลดรายชื่อลูกค้าไม่ได้ กรุณาลองใหม่");
 return <><div className="page-heading"><div><div className="eyebrow">ESTIMATE WORKSPACE</div><h1>สร้างโครงการใหม่</h1><p>ข้อมูลโครงการ ช่วงเวลาทำงาน และสรุปในพื้นที่เดียว</p></div><div className="heading-actions"><span className="badge neutral">Draft</span><Link className="button" href="/projects">← โครงการทั้งหมด</Link></div></div><ProjectForm customers={data??[]} requestId={randomUUID()}/></>;
}
