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
