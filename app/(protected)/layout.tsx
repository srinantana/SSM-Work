import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "./logout";
export const dynamic = "force-dynamic";
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <><header className="app-header"><div className="brand">SSM <span>WORK</span></div>
    <div className="account"><span>{user.email}</span><form action={logout}><button className="secondary">ออกจากระบบ</button></form></div>
  </header><nav className="app-nav" aria-label="เมนูหลัก"><Link href="/projects">โครงการของฉัน</Link><Link href="/dashboard">Master และทดลองคำนวณ</Link></nav><main className="workspace">{children}</main></>;
}
