import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTrialAccess } from "@/lib/trial";
import { ProjectForm } from "../../new/project-form";
export default async function EditProject({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const {user,supabase}=await requireTrialAccess();
 const {data:project,error}=await supabase.from("ssm_projects").select("*").eq("id",id).eq("owner_id",user.id).eq("status","DRAFT").maybeSingle();
 if(error)throw new Error("อ่าน Draft ไม่สำเร็จ");if(!project)notFound();
 const {data:customers,error:customerError}=await supabase.from("ssm_trial_customers").select("source_key,name").eq("batch_id",project.batch_id).order("name");
 if(customerError)throw new Error("อ่านรายชื่อลูกค้าไม่สำเร็จ");
 return <><div className="page-heading"><div><div className="eyebrow">EDIT DRAFT · {project.project_no}</div><h1>แก้ไข Draft</h1><p>แก้ไขข้อมูลโครงการ แล้วบันทึกกลับฉบับเดิม</p></div><Link className="button" href={`/projects/${id}`}>← กลับโครงการ</Link></div><ProjectForm customers={customers??[]} requestId={id} initial={project}/></>;
}
