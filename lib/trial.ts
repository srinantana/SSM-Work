import { cache } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const trialAccess = cache(async () => {
  const user = await currentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { error: claimError } = await supabase.rpc("ssm_claim_trial_access");
  if (claimError) throw new Error("ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองใหม่");
  const { data: batches, error } = await supabase.from("ssm_trial_imports")
    .select("id,batch_key,label,summary").eq("state", "READY").order("created_at", { ascending: false });
  if (error) throw new Error("อ่านชุดข้อมูลไม่สำเร็จ กรุณาลองใหม่");
  return { user, supabase, batches: batches ?? [] };
});
export async function requireTrialAccess() {
  const access = await trialAccess();
  if (!access) redirect("/login");
  if (!access.batches.length) redirect("/pending");
  return access;
}
