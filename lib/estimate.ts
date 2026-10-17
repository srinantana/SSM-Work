export const sections = [
 {key:"manpower",name:"Manpower",thai:"ทีมงาน / เบี้ยเลี้ยง",icon:"01",hint:"ค่าแรง เบี้ยเลี้ยง และ OT แยกรายการ"},
 {key:"subcontract",name:"Subcontract",thai:"ผู้รับเหมา / ขนส่ง",icon:"02",hint:"เหมาจ่าย Manday และค่าขนส่งอุปกรณ์"},
 {key:"accommodation",name:"Accommodation",thai:"ที่พัก",icon:"03",hint:"จำนวนห้อง × คืน × ราคาต่อคืน"},
 {key:"travel",name:"Travel",thai:"ตั๋ว / เอกสารเดินทาง",icon:"04",hint:"ตั๋วเครื่องบิน วีซ่า ประกัน และเอกสาร"},
 {key:"transport",name:"Transport",thai:"รถ / การเดินทางหน้างาน",icon:"05",hint:"รถรายวัน เหมาต่อเที่ยว และระยะทาง"},
 {key:"site_expense",name:"Site Expense",thai:"ค่าใช้จ่ายหน้างาน",icon:"06",hint:"อุปกรณ์ ค่าใช้จ่ายอื่น และรายการเพิ่มเติม"},
] as const;
export type Section = typeof sections[number]["key"];
export const units:Record<string,{label:string;q:string;p:string;autoQ:boolean;autoP:boolean}>={
 "person/day":{label:"บาท / คน / วัน",q:"คน",p:"วัน",autoQ:true,autoP:true},
 "person/hour":{label:"บาท / คน / ชั่วโมง",q:"คน",p:"ชั่วโมง",autoQ:true,autoP:false},
 "person/half day":{label:"บาท / คน / ครึ่งวัน",q:"คน",p:"ครึ่งวัน",autoQ:true,autoP:false},
 "room/night":{label:"บาท / ห้อง / คืน",q:"ห้อง",p:"คืน",autoQ:true,autoP:true},
 "room/month":{label:"บาท / ห้อง / เดือน",q:"ห้อง",p:"เดือน",autoQ:true,autoP:false},
 "vehicle/day":{label:"บาท / คัน / วัน",q:"คัน",p:"วัน",autoQ:true,autoP:true},
 "vehicle/round trip":{label:"บาท / คัน / เที่ยวไปกลับ",q:"คัน",p:"เที่ยวไปกลับ",autoQ:true,autoP:false},
 "vehicle/site trip":{label:"บาท / คัน / เที่ยวหน้างาน",q:"คัน",p:"เที่ยวหน้างาน",autoQ:true,autoP:false},
 "person/trip":{label:"บาท / คน / เที่ยว",q:"คน",p:"เที่ยว",autoQ:true,autoP:false},
 "km":{label:"บาท / กม.",q:"กม.",p:"ชุด",autoQ:false,autoP:false},
 "lot":{label:"บาท / งาน",q:"งาน",p:"ชุด",autoQ:false,autoP:false},
 "kg":{label:"บาท / กก.",q:"กก.",p:"เที่ยว",autoQ:false,autoP:false},
 "trip":{label:"บาท / เที่ยว",q:"เที่ยว",p:"ชุด",autoQ:false,autoP:false},
};
export type Rate={id:string;source_key:string;version_key:string;category:string;name:string;unit:string;amount:number;currency:string;country:string|null;location:string|null;valid_from:string;valid_to:string};
export type Settings={people:string;rooms:string;vehicles:string;start_date:string;end_date:string;travel_days:number;pricing_date:string};
export type ExpenseLine={id:string;section:Section;name:string;unit:string;quantity_mode:"auto"|"manual";quantity:string;period_mode:"auto"|"manual";periods:string;rate_mode:"master"|"manual";rate_id:string;rate:string;reason:string;notes:string;snapshot?:Rate|null;amount_thb?:number|null};
export type EstimateDocument={settings:Settings;included:Record<Section,boolean>;lines:ExpenseLine[]};
export function calendar(start:string,end:string){
 const a=Date.parse(start),b=Date.parse(end);
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return {days:0,nights:0};
 const nights=Math.round((b-a)/86400000);return {days:nights+1,nights};
}
export function rateSection(r:Pick<Rate,"category"|"unit"|"source_key">):Section{
 if(r.category==="ALLOWANCE")return "manpower";
 if(r.unit.startsWith("vehicle/")||r.unit==="km")return "transport";
 if(r.source_key.startsWith("LEG-ADD-INSTALL"))return "subcontract";
 return "site_expense";
}
// Decimal arithmetic: preserve six decimal places in each input and round each line once to satang.
export function decimal(v:string):bigint|null{
 if(!/^\d{1,8}(\.\d{1,6})?$/.test(v))return null;
 const [w,f=""]=v.split(".");return BigInt(w)*1000000n+BigInt(f.padEnd(6,"0"));
}
export function money(cents:bigint){return new Intl.NumberFormat("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(cents)/100);}
export function resolveLine(line:ExpenseLine,settings:Settings,rates:Rate[]){
 const u=units[line.unit],date=calendar(settings.start_date,settings.end_date);
 const quantity=line.quantity_mode==="auto"?(line.unit.startsWith("person/")?settings.people:line.unit.startsWith("room/")?settings.rooms:line.unit.startsWith("vehicle/")?settings.vehicles:""):line.quantity;
 const periods=line.period_mode==="auto"?(line.unit==="room/night"?String(date.nights):line.unit.endsWith("/day")?String(date.days):""):line.periods;
 const source=rates.find(r=>r.id===line.rate_id)??line.snapshot??null;
 const validSource=source&&source.id===line.rate_id&&source.unit===line.unit&&rateSection(source)===line.section&&settings.pricing_date>=source.valid_from&&settings.pricing_date<=source.valid_to;
 const price=line.rate_mode==="master"?(validSource?String(source.amount):""):line.rate;
 const q=decimal(quantity),p=decimal(periods),r=decimal(price);
 const issues:string[]=[];
 if(!line.name.trim())issues.push("ชื่อรายการ");
 if(!u||(line.quantity_mode==="auto"&&!u.autoQ)||(line.period_mode==="auto"&&!u.autoP))issues.push("หน่วย / วิธีคำนวณ");
 if(q===null||q<=0n)issues.push("จำนวน");if(p===null)issues.push("วัน / รอบ");if(r===null)issues.push(line.rate_mode==="master"?"ราคา Master ตามวันที่":"ราคา");
 if(line.rate_mode==="manual"&&!line.reason.trim())issues.push("ที่มาราคา / เหตุผล");
 const product=q!==null&&p!==null&&r!==null?(q*p*r+5000000000000000n)/10000000000000000n:null;
 if(product!==null&&product>100000000000000n)issues.push("ยอดเกินขีดจำกัด");
 const cents=issues.length||q===null||p===null||r===null?null:(q*p*r+5000000000000000n)/10000000000000000n;
 return {quantity,periods,price,source,issues,cents};
}
export function summarize(doc:EstimateDocument,rates:Rate[]){
 const groups=sections.map(s=>{const rows=doc.lines.filter(l=>l.section===s.key).map(l=>resolveLine(l,doc.settings,rates));return {...s,count:rows.length,pending:rows.filter(l=>l.cents===null).length,cents:rows.reduce((n,l)=>n+(l.cents??0n),0n),included:doc.included[s.key]};});
 return {groups,pending:groups.filter(g=>g.included).reduce((n,g)=>n+g.pending,0),cents:groups.filter(g=>g.included).reduce((n,g)=>n+g.cents,0n)};
}
export const presets:Record<Section,{label:string;unit:string;name:string}[]>={
 manpower:[{label:"ค่าแรงรายวัน",unit:"person/day",name:"ค่าแรง"},{label:"เบี้ยเลี้ยง",unit:"person/day",name:"เบี้ยเลี้ยง"},{label:"OT",unit:"person/hour",name:"OT"}],
 subcontract:[{label:"ผู้รับเหมาเหมาจ่าย",unit:"lot",name:"ผู้รับเหมา"},{label:"Manday",unit:"person/day",name:"ผู้รับเหมา Manday"},{label:"ขนส่งอุปกรณ์",unit:"trip",name:"ขนส่งอุปกรณ์"}],
 accommodation:[{label:"ที่พักรายคืน",unit:"room/night",name:"ค่าที่พัก"},{label:"ที่พักรายเดือน",unit:"room/month",name:"ค่าที่พักรายเดือน"}],
 travel:[{label:"ตั๋วเครื่องบิน",unit:"person/trip",name:"ตั๋วเครื่องบิน"},{label:"วีซ่า / ประกัน",unit:"person/trip",name:"วีซ่า / ประกัน"}],
 transport:[{label:"รถรายวัน",unit:"vehicle/day",name:"ค่ารถรายวัน"},{label:"เที่ยวไปกลับ",unit:"vehicle/round trip",name:"ค่าเดินทางไปกลับ"},{label:"ค่าระยะทาง",unit:"km",name:"ค่าเดินทางตามระยะทาง"}],
 site_expense:[{label:"อุปกรณ์หน้างาน",unit:"lot",name:"อุปกรณ์หน้างาน"},{label:"รายการอื่น",unit:"lot",name:""}],
};
