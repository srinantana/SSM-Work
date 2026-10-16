import { NextRequest } from "next/server";
import { trialAccess } from "@/lib/trial";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 const headers={"Cache-Control":"private, no-store"},access=await trialAccess();
 if(!access)return Response.json({error:"Unauthorized"},{status:401,headers});
 if(!access.batches.length)return Response.json({error:"Access pending"},{status:403,headers});
 if(request.headers.get("origin")!==request.nextUrl.origin||!request.headers.get("content-type")?.startsWith("application/json"))return Response.json({error:"Invalid request origin"},{status:403,headers});
 let body;try{body=await request.json();}catch{return Response.json({error:"Invalid input"},{status:400,headers});}
 const decimal=(v:unknown)=>(typeof v==="string"||typeof v==="number")&&/^\d+(\.\d{1,6})?$/.test(String(v))&&Number(v)<=1000000;
 if(!body||typeof body.rateKey!=="string"||body.rateKey.length>120||!decimal(body.quantity)||!decimal(body.periods)||body.trialAck!==true)return Response.json({error:"กรอกจำนวนและรอบให้ครบ และยืนยันเงื่อนไขการทดลอง"},{status:400,headers});
 const {data,error}=await access.supabase.rpc("ssm_trial_calculate_line",{p_batch_key:access.batches[0].batch_key,p_rate_key:body.rateKey,p_quantity:String(body.quantity),p_periods:String(body.periods),p_trial_ack:true});
 if(error)return Response.json({error:"คำนวณไม่ได้ กรุณาตรวจสิทธิ์และความครบถ้วนของราคา"},{status:422,headers});
 return Response.json(data,{headers});
}
