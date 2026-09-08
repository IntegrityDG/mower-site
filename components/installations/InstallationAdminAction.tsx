"use client";
import { useEffect,useRef,useState,type FormEvent } from "react";
type Field={name:string;label:string;kind?:"money"|"number"|"text"|"select"|"checkbox";value?:string|number|boolean;options?:{value:string;label:string}[];optional?:boolean};
type Props={installationId?:string;action:string;title:string;fields?:Field[];base?:Record<string,unknown>;disabled?:boolean;reasonRequired?:boolean;onSaved:()=>Promise<void>;scope?:string;endpoint?:string};
export default function InstallationAdminAction({installationId,action,title,fields=[],base={},disabled=false,reasonRequired=true,onSaved,scope="",endpoint}:Props){
  const [pending,setPending]=useState<Record<string,unknown>|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),inFlight=useRef(false);
  const key=`ids-admin-operation:${installationId??"defaults"}:${action}:${scope}`;
  useEffect(()=>{try{const saved=sessionStorage.getItem(key);if(saved)setPending(JSON.parse(saved));}catch{setMessage("Saved operation could not be read. Review history before repeating it.");}},[key]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(disabled||inFlight.current)return;
    let body=pending;
    try{
      if(!body){
        const form=new FormData(event.currentTarget);body={...base,operationKey:crypto.randomUUID(),reason:String(form.get("reason")??"")};if(installationId&&!endpoint)body.action=action;
        for(const field of fields){const raw=String(form.get(field.name)??"");if(field.optional&&!raw)continue;let value:string|number|boolean=raw;
          if(field.kind==="checkbox")value=form.has(field.name);
          if(field.kind==="number")value=Number(raw);
          if(field.kind==="money"){if(!/^-?(0|[1-9]\d*)(\.\d{1,2})?$/.test(raw))throw new Error("Enter dollars with at most two decimal places.");value=Math.round(Number(raw)*100);}
          if(field.name.startsWith("pricing."))body.pricing={...(body.pricing as object),[field.name.slice(8)]:value};else body[field.name]=value;
        }
        sessionStorage.setItem(key,JSON.stringify(body));setPending(body);
      }
      inFlight.current=true;setBusy(true);setMessage("");
      const response=await fetch(endpoint??(installationId?`/api/admin/installations/${installationId}`:"/api/admin/installations"),{method:endpoint?"POST":"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),result=await response.json();
      if(!response.ok){if(response.status===400){sessionStorage.removeItem(key);setPending(null);}throw new Error(result.error||"Operation could not be confirmed. Retry with this same key.");}
      if(!result.ok)throw new Error("Operation response was incomplete. Retry this same key.");
      sessionStorage.removeItem(key);setPending(null);setMessage(result.processorStatus?`Stripe refund status: ${result.processorStatus}. Only successful refunds reduce net payments.`:result.replayed?"Previously saved operation confirmed.":"Saved.");await onSaved();
    }catch(error){setMessage((error as Error).message);}finally{inFlight.current=false;setBusy(false);}
  }
  return <form onSubmit={submit} className="space-y-3 rounded-xl border p-4"><h4 className="font-bold">{title}</h4>
    {pending?<><p className="text-sm">A saved operation is awaiting confirmation. Retrying keeps its original details.</p><details><summary>Saved details</summary><pre className="overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(pending,null,2)}</pre></details></>:
      <>{fields.map(field=><label key={field.name} className="block text-sm">{field.label}{field.kind==="checkbox"?<input name={field.name} type="checkbox" required={!field.optional} defaultChecked={field.value===true} className="ml-3"/>:field.kind==="select"?<select name={field.name} required={!field.optional} defaultValue={typeof field.value==="boolean"?undefined:field.value??""} className="mt-1 block w-full rounded border p-2"><option value="" disabled>Choose</option>{field.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:<input name={field.name} required={!field.optional} type={field.kind==="number"?"number":"text"} inputMode={field.kind==="money"?"decimal":undefined} defaultValue={typeof field.value==="boolean"?undefined:field.value} className="mt-1 block w-full rounded border p-2"/>}</label>)}<label className="block text-sm">Approval / reason{!reasonRequired&&" (optional)"}<textarea name="reason" required={reasonRequired} maxLength={2000} className="mt-1 block w-full rounded border p-2"/></label></>}
    <button disabled={disabled||busy} className="min-h-11 rounded bg-slate-950 px-4 py-2 text-white disabled:opacity-50">{busy?"Saving…":pending?"Retry / confirm saved operation":title}</button>
    {message&&<p role="status" className="break-words text-sm">{message}</p>}
  </form>;
}
