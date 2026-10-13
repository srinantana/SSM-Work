"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw new Error("ไม่สามารถออกจากระบบได้ กรุณาลองอีกครั้ง");
  redirect("/login");
}
