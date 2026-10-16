import Link from "next/link";
import { requireTrialAccess } from "@/lib/trial";
import { TrialWorkspace } from "./trial-workspace";
export default async function Dashboard() {
  const {batches}=await requireTrialAccess();
  return <><p className="eyebrow">SSM SITE EXPENSE</p><h1>ทดลองข้อมูลจาก Sheet</h1>
    <p className="muted">ใช้ข้อมูลกลางประกอบการทดลองคำนวณ ก่อนยืนยันราคาและกฎสำหรับระบบจริง</p>
    <section className="stats"><div><strong>{batches[0].summary.rates.toLocaleString("th-TH")}</strong><span>รายการ Master</span></div><div><strong>{batches[0].summary.customers}</strong><span>ลูกค้า</span></div><div><strong>{batches[0].summary.rules}</strong><span>กฎคำนวณ</span></div></section>
    <section className="notice"><h2>เริ่มใช้งานโครงการ</h2><p>สร้างโครงการใหม่และบันทึกข้อมูลโครงการเป็น Draft</p><Link className="button-link" href="/projects/new">+ สร้างโครงการใหม่</Link></section><TrialWorkspace />
  </>;
}
