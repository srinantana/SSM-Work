"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signup, forgotPassword, resetPassword } from "./actions";
export function AuthForm({ mode }: { mode: "signup" | "forgot" | "reset" }) {
  const [state, action, pending] = useActionState(mode === "signup" ? signup : mode === "forgot" ? forgotPassword : resetPassword, { error: null, message: null });
  return <><form action={action} className="login-form">
    {mode !== "reset" && <><label htmlFor="email">อีเมล</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} /></>}
    {mode !== "forgot" && <><label htmlFor="password">รหัสผ่านใหม่</label><input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} />
      <label htmlFor="confirmPassword">ยืนยันรหัสผ่าน</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></>}
    {state.error && <p className="error" role="alert">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
    <button disabled={pending || !!state.message}>{pending ? "กำลังดำเนินการ…" : mode === "signup" ? "สมัครและยืนยันอีเมล" : mode === "forgot" ? "ส่งลิงก์รีเซ็ต" : "บันทึกรหัสผ่านใหม่"}</button>
  </form><p className="hint"><Link href="/login">กลับไปเข้าสู่ระบบ</Link></p></>;
}
