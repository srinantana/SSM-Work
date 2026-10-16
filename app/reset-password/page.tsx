import { requireUser } from "@/lib/auth";
import { AuthForm } from "@/app/auth/auth-form";
export const dynamic = "force-dynamic";
export default async function ResetPasswordPage() {
  await requireUser();
  return <main className="login-shell"><section className="login-card"><h1>ตั้งรหัสผ่านใหม่</h1><AuthForm mode="reset" /></section></main>;
}
