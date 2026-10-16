import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireTrialAccess } from "@/lib/trial";
import { ProjectForm } from "./project-form";
export default async function NewProject(){
 const {supabase,batches}=await requireTrialAccess();
 const {data,error}=await supabase.from("ssm_trial_customers").select("source_key,name").eq("batch_id",batches[0].id).order("name");
 if(error)throw new Error("โหลดรายชื่อลูกค้าไม่ได้ กรุณาลองใหม่");
 return <><Link href="/projects">← โครงการของฉัน</Link><p className="eyebrow">NEW PROJECT</p><h1>สร้างโครงการใหม่</h1><p className="muted">เริ่มจากข้อมูลโครงการและสถานที่ทำงาน</p><ProjectForm customers={data??[]} requestId={randomUUID()}/></>;
}
