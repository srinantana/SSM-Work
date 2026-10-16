import { redirect } from "next/navigation";
import { trialAccess } from "@/lib/trial";
import { logout } from "@/app/(protected)/logout";
export const dynamic = "force-dynamic";
export default async function PendingPage() {
  const access = await trialAccess();
  if (!access) redirect("/login");
  if (access.batches.length) redirect("/dashboard");
  return <main className="login-shell"><section className="login-card">
    <div className="brand">RAK <span>SSM WORK</span></div>
    <p className="eyebrow">ยืนยันตัวตนแล้ว</p><h1>รอเปิดสิทธิ์ใช้งาน</h1>
    <p>ส่งอีเมลนี้ให้ผู้ดูแล เพื่อเปิดสิทธิ์ชุดข้อมูลทดลอง</p><strong>{access.user.email}</strong>
    <p><a href="/pending">ตรวจสอบสิทธิ์อีกครั้ง</a></p>
    <form action={logout}><button className="secondary">ออกจากระบบ</button></form>
  </section></main>;
}
