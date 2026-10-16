import Link from "next/link";
import { requireTrialAccess } from "@/lib/trial";
import { workTypes } from "@/lib/project-input";
export default async function Projects(){
 const {user,supabase}=await requireTrialAccess();
 const {data,error}=await supabase.from("ssm_projects").select("id,project_no,name,work_type,site,start_date,end_date,status").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(100);
 if(error)throw new Error("อ่านโครงการไม่ได้ กรุณาลองใหม่");
 return <><p className="eyebrow">PROJECTS</p><div className="page-heading"><div><h1>โครงการของฉัน</h1><p className="muted">เริ่มโครงการใหม่ แล้วเตรียมข้อมูลค่าใช้จ่ายตามลำดับ</p></div><Link className="button-link" href="/projects/new">+ สร้างโครงการใหม่</Link></div>
 {!data?.length?<section className="notice"><h2>เริ่มโครงการแรก</h2><p>ยังไม่มีโครงการที่บันทึกไว้ กรอกลูกค้า สถานที่ และช่วงวันที่เพื่อสร้าง Draft</p><Link href="/projects/new">สร้างโครงการใหม่ →</Link></section>:<section className="notice"><p className="muted">แสดงโครงการล่าสุดสูงสุด 100 รายการ</p><div className="table-scroll"><table><thead><tr><th>โครงการ</th><th>ประเภทงาน / Site</th><th>ช่วงเวลา</th><th>สถานะ</th></tr></thead><tbody>{data.map(p=><tr key={p.id}><td><Link href={`/projects/${p.id}`}>{p.name}</Link><br/><small>{p.project_no}</small></td><td>{workTypes[p.work_type]}<br/>{p.site}</td><td>{p.start_date} – {p.end_date}</td><td><span className="badge">Draft</span></td></tr>)}</tbody></table></div></section>}
 </>;
}
