import { NextRequest } from "next/server";
import { trialAccess } from "@/lib/trial";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
 const headers={"Cache-Control":"private, no-store"},access=await trialAccess();
 if(!access)return Response.json({error:"Unauthorized"},{status:401,headers});
 if(!access.batches.length)return Response.json({error:"Access pending"},{status:403,headers});
 const q=request.nextUrl.searchParams,page=Number(q.get("page")||"0"),category=q.get("category")||"";
 if(!Number.isInteger(page)||page<0||page>10000||(category&&!["LABOR","ALLOWANCE","ACCOMMODATION","TRANSPORT","TRAVEL","LOGISTICS","OTHER"].includes(category)))return Response.json({error:"Invalid filter"},{status:400,headers});
 let query=access.supabase.from("ssm_trial_rates").select("source_key,name,category,location,amount,currency,unit,review_status",{count:"exact"}).eq("batch_id",access.batches[0].id).order("source_key").range(page*50,page*50+49);
 if(category)query=query.eq("category",category);
 const search=(q.get("search")||"").trim().slice(0,120).replace(/[\\%_]/g,"\\$&");
 if(search)query=query.ilike("name","%"+search+"%");
 const {data,count,error}=await query;
 if(error)return Response.json({error:"Cannot read trial rates"},{status:503,headers});
 return Response.json({rates:data,count,page},{headers});
}
