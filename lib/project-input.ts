export const workTypes: Record<string,string> = { INSTALLATION:"ติดตั้ง", COMMISSIONING:"Commissioning", SAT:"SAT", SERVICE:"บริการ / ซ่อมบำรุง", TRAINING:"อบรม" };
export function projectInput(form: FormData) {
  const text=(key:string,max:number,required=false)=>{
    const v=form.get(key); if(typeof v!=="string"||v.trim().length>max||(required&&!v.trim()))throw new Error("กรุณากรอกข้อมูลให้ครบและไม่เกินจำนวนตัวอักษรที่กำหนด");
    return v.trim();
  };
  const name=text("name",160,true), customer_key=text("customer_key",120,true), quotation_ref=text("quotation_ref",80), work_type=text("work_type",30,true),region=text("region",20,true),country=text("country",100,true),site=text("site",240,true),notes=text("notes",2000);
  const start_date=text("start_date",10,true),end_date=text("end_date",10,true);
  const date=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v&&v>="2000-01-01"&&v<="2100-12-31";
  if(!date(start_date)||!date(end_date)||end_date<start_date)throw new Error("วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น และใช้ปี ค.ศ. 2000–2100");
  const travel=text("travel_days",3,true);if(!/^\d{1,3}$/.test(travel)||Number(travel)>365)throw new Error("จำนวนวันเดินทางต้องเป็นจำนวนเต็ม 0–365");
  if(!Object.hasOwn(workTypes,work_type)||!["DOMESTIC","OVERSEAS"].includes(region))throw new Error("ประเภทงานหรือพื้นที่ไม่ถูกต้อง");
  return {name,customer_key,quotation_ref,work_type,region,country:region==="DOMESTIC"?"ไทย":country,site,start_date,end_date,travel_days:Number(travel),notes};
}
