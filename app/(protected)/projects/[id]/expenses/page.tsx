import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTrialAccess } from "@/lib/trial";
import { EstimateEditor } from "./estimate-editor";
export default async function Expenses({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const {user,supabase}=await requireTrialAccess();
 const {data:p,error}=await supabase.from("ssm_projects").select("*").eq("id",id).eq("owner_id",user.id).maybeSingle();
 if(error)throw new Error("อ่านโครงการไม่ได้");if(!p)notFound();
 const [estimate,rates]=await Promise.all([
  supabase.from("ssm_project_estimates").select("*").eq("project_id",id).maybeSingle(),
  supabase.from("ssm_rate_versions").select("id,source_key,version_key,category,name,unit,amount,currency,country,location,valid_from,valid_to").eq("batch_id",p.batch_id).eq("publication_status","ACTIVE").order("source_key"),
 ]);
 if(estimate.error||rates.error)throw new Error("อ่านค่าใช้จ่ายหรือราคา Master ไม่สำเร็จ กรุณาลองใหม่");
 const available=(rates.data??[]).filter(r=>r.location!=="Local"||p.region==="DOMESTIC");
 return <><div className="page-heading"><div><div className="eyebrow">ESTIMATE STUDIO · {p.project_no}</div><h1>{p.name}</h1><p>เพิ่มครั้งเดียว คำนวณต่อให้ครบ · ค่าใช้จ่าย 6 หมวด</p></div><div className="heading-actions"><Link className="button" href={`/projects/${id}`}>← ข้อมูลโครงการ</Link><span className="badge neutral">{p.status}</span></div></div><EstimateEditor project={p} initial={estimate.data} rates={available}/></>;
}
