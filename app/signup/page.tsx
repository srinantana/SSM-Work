import { AuthForm } from "@/app/auth/auth-form";
export default function SignupPage() {
  return <main className="login-shell"><section className="login-card"><div className="brand">RAK <span>SSM WORK</span></div><h1>สมัครบัญชีใหม่</h1><p className="muted">ยืนยันอีเมลและรอผู้ดูแลอนุมัติสิทธิ์ก่อนเข้าถึงข้อมูลบริษัท</p><AuthForm mode="signup" /></section></main>;
}
