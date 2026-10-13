"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export type LoginState = { error: string | null };
export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password || email.length > 254 || password.length > 1024) {
    return { error: "กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน" };
  }
  const supabase = await createClient();
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { error: "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีเมลและรหัสผ่าน แล้วลองอีกครั้ง" };
  } catch {
    return { error: "ไม่สามารถเชื่อมต่อได้ กรุณาลองอีกครั้ง" };
  }
  redirect("/dashboard");
}
