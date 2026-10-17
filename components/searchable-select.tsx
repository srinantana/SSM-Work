"use client";
import { useId, useState } from "react";
type Option={value:string;label:string};
export function SearchableSelect({name,label,options,value,onChange,required=false}:{name?:string;label:string;options:Option[];value:string;onChange:(value:string)=>void;required?:boolean}){
 const id=useId();
 const [text,setText]=useState(()=>options.find(o=>o.value===value)?.label??"");
 return <div className="searchable-select"><label htmlFor={id}>{label}{required?" *":""}</label>
 <input id={id} list={`${id}-options`} value={text} autoComplete="off" required={required} placeholder="พิมพ์ค้นหาแล้วเลือก…" onChange={e=>{
  const next=e.currentTarget.value,match=options.find(o=>o.label===next);
  setText(next);onChange(match?.value??"");
  e.currentTarget.setCustomValidity(match||(!required&&!next)?"":"กรุณาเลือกรายการจากตัวเลือก");
 }}/><datalist id={`${id}-options`}>{options.map(o=><option key={o.value} value={o.label}/>)}</datalist>
 {name&&<input type="hidden" name={name} value={value}/>}
 </div>;
}
