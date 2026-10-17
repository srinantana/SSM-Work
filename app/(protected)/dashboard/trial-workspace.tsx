"use client";
import {useEffect,useState} from "react";
import {SearchableSelect} from "@/components/searchable-select";
type Rate={source_key:string;name:string;location:string|null;amount:number|null;currency:string;unit:string|null;review_status:string};
export function TrialWorkspace(){
 const [rates,setRates]=useState<Rate[]>([]),[page,setPage]=useState(0),[category,setCategory]=useState("");
 const [search,setSearch]=useState(""),[query,setQuery]=useState(""),[count,setCount]=useState(0),[status,setStatus]=useState("กำลังอ่านข้อมูล…");
 const [selected,setSelected]=useState<Rate|null>(null),[quantity,setQuantity]=useState("1"),[periods,setPeriods]=useState("1"),[ack,setAck]=useState(false),[result,setResult]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();setStatus("กำลังอ่านข้อมูล…");
  fetch("/api/trial?"+new URLSearchParams({page:String(page),category,search:query}),{cache:"no-store",signal:controller.signal})
   .then(async r=>{if(r.status===401){location.replace("/login");throw Error("กรุณาเข้าสู่ระบบใหม่");}if(r.status===403){location.replace("/pending");throw Error("รอเปิดสิทธิ์");}if(!r.ok)throw Error("อ่านข้อมูลไม่ได้ กรุณาลองใหม่");return r.json();})
   .then(data=>{setRates(data.rates);setCount(data.count);setStatus(data.count.toLocaleString("th-TH")+" รายการ");})
   .catch(error=>{if(!controller.signal.aborted){setRates([]);setStatus(error.message);}});
  return()=>controller.abort();
 },[page,category,query]);
 async function calculate(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!selected||busy)return;
  if(!ack||quantity===""||periods===""){setResult("กรอกจำนวนและรอบให้ครบ พร้อมยืนยันเงื่อนไข");return;}
  setBusy(true);setResult("กำลังคำนวณ…");
  try{const response=await fetch("/api/trial/calculate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rateKey:selected.source_key,quantity,periods,trialAck:ack})});const data=await response.json();if(!response.ok)throw Error(data.error||"คำนวณไม่ได้");setResult("ยอดทดลอง "+Number(data.amount).toLocaleString("th-TH",{minimumFractionDigits:2,maximumFractionDigits:6})+" "+data.currency+" — ยังไม่ใช่ยอดอนุมัติ");}
  catch(error){setResult(error instanceof Error?error.message:"คำนวณไม่ได้");}finally{setBusy(false);}
 }
 return <><section className="notice"><h2>Master Database</h2><p className="warning">ราคาประวัติและสกุลเงินยังรอยืนยัน ช่องว่างไม่ใช่ราคา 0 เงินเดือนที่ต้นทางระบุ “not use” ใช้คำนวณไม่ได้</p>
 <form className="filters" onSubmit={e=>{e.preventDefault();setPage(0);setQuery(search);}}>
  <SearchableSelect label="หมวดราคา" options={[{value:"",label:"ทุกหมวด"},...["ALLOWANCE","ACCOMMODATION","TRANSPORT","TRAVEL","LOGISTICS","OTHER","LABOR"].map(c=>({value:c,label:c}))]} value={category} onChange={v=>{setCategory(v);setPage(0);}}/>
  <input aria-label="ค้นหารายการ" placeholder="ค้นหาชื่อรายการ" value={search} onChange={e=>setSearch(e.target.value)} maxLength={120}/><button>ค้นหา</button>
 </form><p role="status">{status}</p><div className="table-scroll"><table><thead><tr><th>รายการ</th><th>พื้นที่</th><th>ราคา</th><th>หน่วย</th><th></th></tr></thead><tbody>{rates.map(rate=><tr key={rate.source_key}><td><small>{rate.source_key}</small><br/>{rate.name}</td><td>{rate.location||"—"}</td><td>{rate.amount===null?"รอราคา":Number(rate.amount).toLocaleString("th-TH")+" "+rate.currency}</td><td>{rate.unit||"รอหน่วย"}</td><td><button className="secondary" disabled={rate.amount===null||rate.review_status==="DEPRECATED"} onClick={()=>{setSelected(rate);setAck(false);setResult("");}}>เลือกทดลอง</button></td></tr>)}</tbody></table></div>
 <div className="pagination"><button className="secondary" disabled={page===0} onClick={()=>setPage(page-1)}>ก่อนหน้า</button><span>หน้า {page+1} / {Math.max(1,Math.ceil(count/50))}</span><button className="secondary" disabled={(page+1)*50>=count} onClick={()=>setPage(page+1)}>ถัดไป</button></div></section>
 <section className="notice"><h2>ทดลองคำนวณ</h2><p>{selected?selected.source_key+" · "+selected.name+" · "+selected.unit:"เลือกรายการจาก Master ด้านบน"}</p>
 <form onSubmit={calculate} className="calculator"><label>จำนวนคน / ห้อง / คัน / รายการ<input type="number" min="0" max="1000000" step="0.000001" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label>จำนวนวัน / เดือน / เที่ยว / รอบตามหน่วยราคา<input type="number" min="0" max="1000000" step="0.000001" required value={periods} onChange={e=>setPeriods(e.target.value)}/></label>
 <label className="ack"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} required/>ยอมรับว่าเป็นราคาประวัติรอยืนยัน และระบุรอบตามหน่วยราคาแล้ว</label><button disabled={!selected||busy}>{busy?"กำลังคำนวณ…":"คำนวณทดลอง"}</button></form>
 <p role="status">{result}</p><p className="hint">ราคาขนส่งแบบรวมคน/บริการเป็นทางเลือกแทนราคาฐาน ห้ามบวกซ้ำ การทดลองยังไม่รวม OT, FX, ภาษี หรือยอดอนุมัติโครงการ</p></section></>;
}
