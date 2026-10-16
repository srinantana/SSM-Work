import { AuthForm } from "@/app/auth/auth-form";
export default function ForgotPasswordPage() {
  return <main className="login-shell"><section className="login-card"><div className="brand">RAK <span>SSM WORK</span></div><h1>ลืมรหัสผ่าน</h1><p className="muted">กรอกอีเมลเพื่อรับลิงก์ตั้งรหัสผ่านใหม่</p><AuthForm mode="forgot" /></section></main>;
}
