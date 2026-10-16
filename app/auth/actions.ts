"use server";
import { createClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/app-origin";
import { requireUser } from "@/lib/auth";
export type AuthState = { error: string | null; message: string | null };
function emailValue(form: FormData) {
  const value = form.get("email");
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new Error("กรุณากรอกอีเมลให้ถูกต้อง");
  return value.trim();
}
function passwordValue(form: FormData) {
  const password = form.get("password");
  if (typeof password !== "string" || password.length < 10 || password.length > 128) throw new Error("ใช้รหัสผ่าน 10–128 ตัวอักษร");
  if (password !== form.get("confirmPassword")) throw new Error("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
  return password;
}
export async function signup(_state: AuthState, form: FormData): Promise<AuthState> {
  try {
    const email = emailValue(form), password = passwordValue(form), origin = appOrigin();
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: origin + "/auth/confirm" } });
    if (error) return { error: "สมัครไม่ได้ กรุณาลองใหม่หรือติดต่อผู้ดูแล", message: null };
    return { error: null, message: "ตรวจอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ บัญชีจะเข้าถึงข้อมูลได้หลังผู้ดูแลอนุมัติสิทธิ์" };
  } catch (error) { return { error: error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ", message: null }; }
}
export async function forgotPassword(_state: AuthState, form: FormData): Promise<AuthState> {
  try {
    const email = emailValue(form), origin = appOrigin();
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + "/auth/confirm?flow=recovery" });
    if (error) return { error: "ส่งลิงก์ไม่ได้ กรุณารอสักครู่แล้วลองใหม่", message: null };
    return { error: null, message: "หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้" };
  } catch (error) { return { error: error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ", message: null }; }
}
export async function resetPassword(_state: AuthState, form: FormData): Promise<AuthState> {
  await requireUser();
  try {
    const password = passwordValue(form), supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: "เปลี่ยนรหัสผ่านไม่ได้ กรุณาขอลิงก์ใหม่แล้วลองอีกครั้ง", message: null };
    await supabase.auth.signOut({ scope: "local" });
    return { error: null, message: "ตั้งรหัสผ่านใหม่แล้ว กรุณากลับไปเข้าสู่ระบบ" };
  } catch { return { error: "ดำเนินการไม่สำเร็จ กรุณาลองใหม่", message: null }; }
}
