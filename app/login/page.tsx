import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");
  return <main className="login-shell"><section className="login-card" aria-labelledby="login-title">
    <div className="brand">SSM <span>WORK</span></div>
    <p className="eyebrow">SITE EXPENSE</p>
    <h1 id="login-title">ยินดีต้อนรับ</h1>
    <p className="muted">เข้าสู่ระบบเพื่อจัดการงานและค่าใช้จ่ายหน้างาน</p>
    <LoginForm />
    <p className="hint"><Link href="/signup">สมัครบัญชีใหม่</Link> · <Link href="/forgot-password">ลืมรหัสผ่าน</Link></p>
    <p className="hint">บัญชีใหม่ต้องยืนยันอีเมลและได้รับอนุมัติสิทธิ์ก่อนเห็นข้อมูลบริษัท</p>
  </section></main>;
}
