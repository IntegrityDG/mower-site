export type InstallationIntake={setupSelected?:boolean;name:string;email:string;phone:string;address:string;equipment:string|null;preferredLocation:string|null;internetAvailability:"yes"|"no"|"unsure";undergroundRequested:boolean;estimatedUndergroundFeet:number;startAt:string;groundingAcknowledged:boolean;responsibilitiesAcknowledged:boolean;termsAcknowledged:boolean;undergroundAcknowledged:boolean;cashRequested:boolean;idempotencyKey:string};
export function validateInstallationIntake(raw:unknown, mode:"installation"|"setup_only"="installation"):{ok:true;value:InstallationIntake}|{ok:false;errors:Record<string,string>}{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return{ok:false,errors:{request:"Invalid installation request."}};
  const x=raw as Record<string,unknown>,errors:Record<string,string>={};
  const allowed=["setupSelected","name","email","phone","address","equipment","preferredLocation","internetAvailability","undergroundRequested","estimatedUndergroundFeet","startAt","groundingAcknowledged","responsibilitiesAcknowledged","termsAcknowledged","undergroundAcknowledged","cashRequested","idempotencyKey"];
  if(Object.keys(x).some(k=>!allowed.includes(k)))errors.request="Unexpected request fields.";
  const text=(k:string,max:number,min=1)=>{const v=typeof x[k]==="string"?x[k].trim():"";if(v.length<min||v.length>max)errors[k]=`Required (${min}–${max} characters).`;return v;};
  const name=text("name",160),email=text("email",320).toLowerCase(),phone=text("phone",80,7),address=text("address",500,5),startAt=text("startAt",60),idempotencyKey=text("idempotencyKey",36);
  if(!/^\S+@\S+\.\S+$/.test(email))errors.email="Enter a valid email.";
  if(!["yes","no","unsure"].includes(String(x.internetAvailability)))errors.internetAvailability="Choose Yes, No, or Unsure.";
  for(const k of (mode==="installation"?["groundingAcknowledged","responsibilitiesAcknowledged","termsAcknowledged"]:["responsibilitiesAcknowledged","termsAcknowledged"]))if(x[k]!==true)errors[k]="Acknowledgement is required.";
  for(const k of ["setupSelected","groundingAcknowledged","undergroundRequested","undergroundAcknowledged","cashRequested"])if(x[k]!==undefined&&typeof x[k]!=="boolean")errors[k]="Choose a valid acknowledgement.";
  if(x.undergroundRequested===true&&x.undergroundAcknowledged!==true)errors.undergroundAcknowledged="811 and underground-work acknowledgement is required.";
  if(mode==="setup_only"&&(x.undergroundRequested===true||x.groundingAcknowledged===true))errors.request="Setup-only does not include installation work.";
  const feet=x.estimatedUndergroundFeet??0;if(typeof feet!=="number"||!Number.isFinite(feet)||feet<0||feet>10000||Math.abs(Math.round(feet*100)-feet*100)>1e-8)errors.estimatedUndergroundFeet="Enter a valid estimate with at most two decimal places.";
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(startAt)||!Number.isFinite(Date.parse(startAt))||new Date(startAt).toISOString()!==startAt)errors.startAt="Choose a valid appointment.";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))errors.idempotencyKey="Invalid request identifier.";
  const optional=(k:string,max:number)=>{if(x[k]!==undefined&&x[k]!==null&&(typeof x[k]!=="string"||x[k].length>max))errors[k]="Invalid field.";return typeof x[k]==="string"?x[k].trim()||null:null;};
  const equipment=optional("equipment",200),preferredLocation=optional("preferredLocation",1000);
  return Object.keys(errors).length?{ok:false,errors}:{ok:true,value:{name,email,phone,address,startAt,idempotencyKey:idempotencyKey.toLowerCase(),equipment,preferredLocation,
    internetAvailability:x.internetAvailability as InstallationIntake["internetAvailability"],undergroundRequested:x.undergroundRequested===true,estimatedUndergroundFeet:feet as number,
    ...(x.setupSelected===undefined?{}:{setupSelected:x.setupSelected===true}),groundingAcknowledged:mode==="installation",responsibilitiesAcknowledged:true,termsAcknowledged:true,undergroundAcknowledged:x.undergroundAcknowledged===true,cashRequested:x.cashRequested===true}};
}
