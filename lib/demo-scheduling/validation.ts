import { DEMO_EQUIPMENT_INTERESTS, DEMO_REQUEST_BOT_TRAP_FIELD, DEMO_SOURCES, type DemoEquipmentInterest, type DemoSource } from "./types";
const clean=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max+1):"";
export function validateDemoRequest(input:unknown){
 const b=(input&&typeof input==="object"?input:{})as Record<string,unknown>,errors:Record<string,string>={};
 const name=clean(b.name,160),email=clean(b.email,320).toLowerCase(),phone=clean(b.phone,80),address=clean(b.propertyAddress,500),startAt=clean(b.requestedStartAt,40),source=clean(b.source,40)as DemoSource,equipmentInterest=clean(b.equipmentInterest,80)as DemoEquipmentInterest,idempotencyKey=clean(b.idempotencyKey,36),honeypot=clean(b[DEMO_REQUEST_BOT_TRAP_FIELD],100);
 if(honeypot)errors.form="Request could not be submitted.";
 if(!name||name.length>160)errors.name="Enter your name.";
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>320)errors.email="Enter a valid email address.";
 if(phone.length<7||phone.length>80)errors.phone="Enter a valid phone number.";
 if(address.length<5||address.length>500)errors.propertyAddress="Enter the property address.";
 if(!DEMO_SOURCES.includes(source))errors.source="Invalid request source.";
 if(!DEMO_EQUIPMENT_INTERESTS.includes(equipmentInterest))errors.equipmentInterest="Choose which machine you would like to see.";
 if(!/^\d{4}-\d{2}-\d{2}T/.test(startAt)||!Number.isFinite(Date.parse(startAt)))errors.requestedStartAt="Choose an available time.";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))errors.idempotencyKey="Invalid submission token.";
 return Object.keys(errors).length?{ok:false as const,errors}:{ok:true as const,value:{name,email,phone,address,startAt,source,equipmentInterest,idempotencyKey}};
}
export function validateDateRange(start:string|null,end:string|null){if(!start||!end||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))return null;const days=(Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86400000;if(days<0||days>42)return null;return{start,end};}
