import { requireUser } from "@/lib/auth";
export default async function Dashboard() {
  await requireUser();
  return <><p className="eyebrow">SSM WORKSPACE</p><h1>พื้นที่ทำงาน</h1>
    <p className="muted">เข้าสู่ระบบสำเร็จ พร้อมเริ่มงานของคุณ</p>
    <section className="notice"><h2>Site Expense</h2><p>พื้นที่สำหรับโมดูลจัดการค่าใช้จ่ายหน้างาน จะเพิ่มข้อมูลและขั้นตอนการทำงานในลำดับถัดไป</p></section>
  </>;
}
