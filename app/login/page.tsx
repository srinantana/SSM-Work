import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");
  return <main className="login-shell"><section className="login-card" aria-labelledby="login-title">
    <div className="brand">SSM <span>WORK</span></div>
    <p className="eyebrow">SITE EXPENSE</p>
    <h1 id="login-title">ยินดีต้อนรับ</h1>
    <p className="muted">เข้าสู่ระบบเพื่อจัดการงานและค่าใช้จ่ายหน้างาน</p>
    <LoginForm />
    <p className="hint">หากยังไม่มีบัญชีหรือลืมรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบ</p>
  </section></main>;
}
