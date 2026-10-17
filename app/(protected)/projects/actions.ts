"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTrialAccess } from "@/lib/trial";
import { projectInput } from "@/lib/project-input";
export async function createProject(_state:{error:string|null},form:FormData):Promise<{error:string|null}>{
 const {user,supabase,batches}=await requireTrialAccess();
 let input;try{input=projectInput(form);}catch(e){return {error:e instanceof Error?e.message:"ข้อมูลไม่ถูกต้อง"};}
 const id=form.get("request_id");
 if(typeof id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return {error:"กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง"};
 const batch_id=batches[0].id;
 const {data:customer,error:customerError}=await supabase.from("ssm_trial_customers").select("source_key").eq("batch_id",batch_id).eq("source_key",input.customer_key).maybeSingle();
 if(customerError||!customer)return {error:"กรุณาเลือกลูกค้าจาก Master ที่มีสิทธิ์ใช้งาน"};
 const {error}=await supabase.from("ssm_projects").insert({id,batch_id,...input});
 if(error){
  if(error.code!=="23505")return {error:"บันทึกโครงการไม่ได้ กรุณาลองอีกครั้ง"};
  const {data:existing}=await supabase.from("ssm_projects").select("id").eq("id",id).eq("owner_id",user.id).maybeSingle();
  if(!existing)return {error:"บันทึกโครงการไม่ได้ กรุณาโหลดหน้าใหม่"};
 }
 revalidatePath("/projects"); redirect(`/projects/${id}`);
}

export async function updateProject(projectId:string,_state:{error:string|null},form:FormData):Promise<{error:string|null}>{
 const {user,supabase}=await requireTrialAccess();
 let input;try{input=projectInput(form);}catch(e){return {error:e instanceof Error?e.message:"ข้อมูลไม่ถูกต้อง"};}
 const revision=Number(form.get("revision"));
 if(!Number.isSafeInteger(revision)||revision<1)return {error:"กรุณาโหลดหน้าใหม่ก่อนแก้ไข"};
 const {data:project,error:readError}=await supabase.from("ssm_projects").select("batch_id,status").eq("id",projectId).eq("owner_id",user.id).maybeSingle();
 if(readError||!project||project.status!=="DRAFT")return {error:"ไม่พบ Draft ที่คุณแก้ไขได้"};
 const {data:customer}=await supabase.from("ssm_trial_customers").select("source_key").eq("batch_id",project.batch_id).eq("source_key",input.customer_key).maybeSingle();
 if(!customer)return {error:"กรุณาเลือกลูกค้าจาก Master ของโครงการ"};
 const {data,error}=await supabase.from("ssm_projects").update(input).eq("id",projectId).eq("owner_id",user.id).eq("status","DRAFT").eq("revision",revision).select("id").maybeSingle();
 if(error)return {error:"บันทึกการแก้ไขไม่ได้ กรุณาลองใหม่"};
 if(!data)return {error:"Draft นี้ถูกแก้จากอีกหน้าจอแล้ว กรุณาโหลดหน้าใหม่เพื่อรับข้อมูลล่าสุด"};
 revalidatePath("/projects");revalidatePath("/dashboard");revalidatePath(`/projects/${projectId}`);redirect(`/projects/${projectId}`);
}
