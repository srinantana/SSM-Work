"use server";
import { revalidatePath } from "next/cache";
import { requireTrialAccess } from "@/lib/trial";
import type { EstimateDocument } from "@/lib/estimate";
export async function saveEstimate(projectId:string,projectRevision:number,revision:number,document:EstimateDocument){
 const {user,supabase}=await requireTrialAccess();
 if(!/^[0-9a-f-]{36}$/i.test(projectId)||!Number.isSafeInteger(revision)||revision<0||!Number.isSafeInteger(projectRevision)||projectRevision<1||JSON.stringify(document).length>300000)return {error:"ข้อมูลเกินขนาดหรือไม่ถูกต้อง"};
 const {data:project}=await supabase.from("ssm_projects").select("id,status,revision").eq("id",projectId).eq("owner_id",user.id).maybeSingle();
 if(!project||project.status!=="DRAFT")return {error:"ไม่พบ Draft ที่คุณแก้ไขได้"};
 if(Number(project.revision)!==projectRevision)return {error:"ข้อมูลโครงการเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่และตรวจช่วงเวลาก่อนบันทึก",conflict:true};
 const payload={project_revision:projectRevision,document};
 const query=revision===0?supabase.from("ssm_project_estimates").insert({project_id:projectId,...payload}):supabase.from("ssm_project_estimates").update(payload).eq("project_id",projectId).eq("revision",revision);
 const {data,error}=await query.select("revision,updated_at,total_thb,subtotal_thb,incomplete_count").maybeSingle();
 if(error?.code==="23505"||error?.code==="40001"||(!error&&!data))return {error:"มีข้อมูลใหม่จากอีกหน้าจอ กรุณาโหลดหน้าใหม่ก่อนแก้ไขต่อ",conflict:true};
 if(error||!data)return {error:"บันทึกไม่สำเร็จ ตรวจจำนวน ราคา และที่มาราคา แล้วลองใหม่"};
 revalidatePath(`/projects/${projectId}`);revalidatePath("/projects");revalidatePath("/dashboard");
 return {data};
}
