import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { addDays, centralLocalToUtc } from "./time";
import { generateAvailableSlots } from "./availability";
import { CUSTOM_DEMO_AREA_ID, toPublicDemoAreaPlanning } from "./public-area-planning";
import type {
  AvailabilityException,
  AvailabilityRule,
  DemoAreaAssignment,
  DemoAreaAssignmentInput,
  DemoRequest,
  DemoServiceArea,
  DemoServiceAreaCity,
  DemoServiceAreaCityInput,
  DemoServiceAreaInput,
  PublicDemoAreaPlan,
} from "./types";
import type { ValidDemoAppointmentRequest } from "@/lib/demo-party/validation";

const requestColumns="id,customer_name,customer_email,customer_phone,property_address,requested_start_at,requested_end_at,status,source,equipment_interest,admin_message,created_at,approved_at,denied_at,cancelled_at,appointment_type,duration_minutes,payment_status,demo_format,notes,information_requested_at";
const serviceAreaColumns="id,name,description,active,sort_order,created_at,updated_at";
const serviceAreaCityColumns="id,region_id,name,state_abbreviation,active,sort_order,created_at,updated_at";
const areaAssignmentColumns="id,service_date,region_id,city_id,custom_city,internal_note,created_at,updated_at";
const mapRequest=(r:Record<string,unknown>):DemoRequest=>({id:String(r.id),customerName:String(r.customer_name),customerEmail:String(r.customer_email),customerPhone:String(r.customer_phone),propertyAddress:String(r.property_address),requestedStartAt:String(r.requested_start_at),requestedEndAt:String(r.requested_end_at),status:r.status as DemoRequest["status"],source:r.source as DemoRequest["source"],equipmentInterest:r.equipment_interest as DemoRequest["equipmentInterest"],adminMessage:r.admin_message as string|null,createdAt:String(r.created_at),approvedAt:r.approved_at as string|null,deniedAt:r.denied_at as string|null,cancelledAt:r.cancelled_at as string|null,appointmentType:(r.appointment_type??"demo") as "demo",durationMinutes:Number(r.duration_minutes??240),paymentStatus:(r.payment_status??"not_started") as NonNullable<DemoRequest["paymentStatus"]>,demoFormat:(r.demo_format??"private") as NonNullable<DemoRequest["demoFormat"]>,notes:r.notes as string|null,informationRequestedAt:r.information_requested_at as string|null});
const mapServiceArea=(r:Record<string,unknown>):DemoServiceArea=>({id:String(r.id),name:String(r.name),description:r.description as string|null,active:Boolean(r.active),sortOrder:Number(r.sort_order),createdAt:String(r.created_at),updatedAt:String(r.updated_at)});
const mapServiceAreaCity=(r:Record<string,unknown>):DemoServiceAreaCity=>({id:String(r.id),regionId:String(r.region_id),name:String(r.name),stateAbbreviation:r.state_abbreviation as string|null,active:Boolean(r.active),sortOrder:Number(r.sort_order),createdAt:String(r.created_at),updatedAt:String(r.updated_at)});
const mapAreaAssignment=(r:Record<string,unknown>):DemoAreaAssignment=>({id:String(r.id),serviceDate:String(r.service_date),regionId:String(r.region_id),cityId:r.city_id as string|null,customCity:r.custom_city as string|null,internalNote:r.internal_note as string|null,createdAt:String(r.created_at),updatedAt:String(r.updated_at)});

export type DemoAreaPlanningServerErrorCode="region_not_found"|"inactive_region"|"city_not_found"|"inactive_city"|"city_region_mismatch"|"reserved_area";
export class DemoAreaPlanningServerError extends Error {
  constructor(public readonly code:DemoAreaPlanningServerErrorCode){super(code);this.name="DemoAreaPlanningServerError";}
}
export async function getAvailableSlots(start:string,end:string,now=new Date()){const c=getSupabaseServiceClient();const rangeStart=centralLocalToUtc(start,"00:00")?.toISOString(),rangeEnd=centralLocalToUtc(addDays(end,1),"00:00")?.toISOString();if(!rangeStart||!rangeEnd)return[];const [{data:rules,error:rErr},{data:exceptions,error:eErr},{data:requests,error:qErr},{data:settings,error:sErr},{data:typeSettings,error:tErr}]=await Promise.all([c.from("demo_availability_rules").select("id,weekday,enabled,start_time,end_time"),c.from("demo_availability_exceptions").select("id,starts_at,ends_at,all_day,reason").lt("starts_at",rangeEnd).gt("ends_at",rangeStart),c.from("demo_requests").select("requested_start_at,requested_end_at,status,appointment_type").in("status",["pending","approved"]).lt("requested_start_at",rangeEnd).gt("requested_end_at",rangeStart),c.from("demo_settings").select("scheduling_horizon_days").eq("id",true).single(),c.from("appointment_type_settings").select("duration_minutes,public_active").eq("appointment_type","demo").single()]);if(rErr||eErr||qErr||sErr||tErr)throw rErr??eErr??qErr??sErr??tErr;if(!typeSettings.public_active)return[];return generateAvailableSlots({start,end,now,rules:rules??[],exceptions:exceptions??[],requests:requests??[],duration:Number(typeSettings.duration_minutes),horizon:Number(settings.scheduling_horizon_days)});}

export async function getPublicDemoAreaPlanning(start:string,end:string):Promise<PublicDemoAreaPlan[]>{
 const c=getSupabaseServiceClient();
 const{data:assignments,error:assignmentError}=await c.from("demo_area_assignments").select("service_date,region_id,city_id,custom_city").gte("service_date",start).lte("service_date",end).order("service_date");
 if(assignmentError)throw assignmentError;
 if(!assignments?.length)return[];
 const regionIds=[...new Set(assignments.map((assignment)=>assignment.region_id))];
 const cityIds=[...new Set(assignments.flatMap((assignment)=>assignment.city_id?[assignment.city_id]:[]))];
 const[{data:areas,error:areaError},{data:cities,error:cityError}]=await Promise.all([
  c.from("demo_service_areas").select("id,name").in("id",regionIds),
  cityIds.length?c.from("demo_service_area_cities").select("id,name,state_abbreviation").in("id",cityIds):Promise.resolve({data:[],error:null}),
 ]);
 if(areaError||cityError)throw areaError??cityError;
 return toPublicDemoAreaPlanning(assignments,areas??[],cities??[]);
}
export async function createDemoRequest(value:ValidDemoAppointmentRequest){const{data,error}=await getSupabaseServiceClient().rpc("scheduling_create_demo_request",{p_name:value.name,p_email:value.email,p_phone:value.phone,p_address:value.address,p_start_at:new Date(value.startAt).toISOString(),p_source:value.source,p_equipment_interest:value.equipmentInterest,p_notes:value.notes,p_demo_format:value.demoFormat,p_party_screening:value.partyScreening,p_idempotency_key:value.idempotencyKey});if(error)throw error;return String(data);}
export async function readDemoRequest(id:string){const{data,error}=await getSupabaseServiceClient().from("demo_requests").select(requestColumns).eq("id",id).single();if(error)throw error;return mapRequest(data as Record<string,unknown>);}
export async function readDemoNotificationEvents(id:string){const{data,error}=await getSupabaseServiceClient().from("demo_notification_events").select("event_type,status,last_error").eq("request_id",id);if(error)throw error;return data??[];}
export async function readAdminScheduling(){
 const c=getSupabaseServiceClient();
 const[
  {data:requests,error:q},
  {data:rules,error:r},
  {data:exceptions,error:e},
  {data:events,error:n},
  {data:serviceAreas,error:a},
  {data:serviceAreaCities,error:cityError},
  {data:areaAssignments,error:assignmentError},
 ]=await Promise.all([
  c.from("demo_requests").select(requestColumns).order("requested_start_at"),
  c.from("demo_availability_rules").select("id,weekday,enabled,start_time,end_time").order("weekday"),
  c.from("demo_availability_exceptions").select("id,starts_at,ends_at,all_day,reason").order("starts_at"),
  c.from("demo_notification_events").select("request_id,event_type,status,last_error"),
  c.from("demo_service_areas").select(serviceAreaColumns).order("sort_order").order("name"),
  c.from("demo_service_area_cities").select(serviceAreaCityColumns).order("region_id").order("sort_order").order("name"),
  c.from("demo_area_assignments").select(areaAssignmentColumns).order("service_date"),
 ]);
 if(q||r||e||n||a||cityError||assignmentError)throw q??r??e??n??a??cityError??assignmentError;
 return{
  requests:(requests??[]).map(x=>mapRequest(x as Record<string,unknown>)),
  rules:(rules??[]).map(x=>({id:x.id,weekday:x.weekday,enabled:x.enabled,startTime:x.start_time.slice(0,5),endTime:x.end_time.slice(0,5)} as AvailabilityRule)),
  exceptions:(exceptions??[]).map(x=>({id:x.id,startsAt:x.starts_at,endsAt:x.ends_at,allDay:x.all_day,reason:x.reason} as AvailabilityException)),
  notifications:eventsByRequest(events??[]),
  serviceAreas:(serviceAreas??[]).map(x=>mapServiceArea(x as Record<string,unknown>)),
  serviceAreaCities:(serviceAreaCities??[]).map(x=>mapServiceAreaCity(x as Record<string,unknown>)),
  areaAssignments:(areaAssignments??[]).map(x=>mapAreaAssignment(x as Record<string,unknown>)),
 };
}
function eventsByRequest(rows:{request_id:string;event_type:string;status:string;last_error:string|null}[]){return rows.reduce<Record<string,typeof rows>>((a,r)=>{(a[r.request_id]??=[]).push(r);return a;},{});}
export async function saveRules(rules:AvailabilityRule[]){const c=getSupabaseServiceClient();for(const r of rules){const{error}=await c.from("demo_availability_rules").update({enabled:r.enabled,start_time:r.startTime,end_time:r.endTime,updated_at:new Date().toISOString()}).eq("weekday",r.weekday);if(error)throw error;}}
export async function addException(value:{startsAt:string;endsAt:string;allDay:boolean;reason:string|null}){const{error}=await getSupabaseServiceClient().from("demo_availability_exceptions").insert({starts_at:value.startsAt,ends_at:value.endsAt,all_day:value.allDay,reason:value.reason});if(error)throw error;}
export async function deleteException(id:string){const{error}=await getSupabaseServiceClient().from("demo_availability_exceptions").delete().eq("id",id);if(error)throw error;}
export async function transitionRequest(id:string,action:string,message:string|null){const{data,error}=await getSupabaseServiceClient().rpc("scheduling_transition_appointment",{p_request_id:id,p_action:action,p_message:message});if(error)throw error;return data as "changed"|"unchanged";}

export async function saveDemoAreaAssignment(value:DemoAreaAssignmentInput){
 const c=getSupabaseServiceClient();
 const normalizedValue=value.regionId===CUSTOM_DEMO_AREA_ID?{...value,cityId:null,customCity:value.customCity?.trim()||null}:value;
 if(normalizedValue.regionId===CUSTOM_DEMO_AREA_ID&&!normalizedValue.customCity)throw new DemoAreaPlanningServerError("reserved_area");
 const{data:existing,error:existingError}=await c.from("demo_area_assignments").select("region_id,city_id").eq("service_date",normalizedValue.serviceDate).maybeSingle();
 if(existingError)throw existingError;
 const{data:region,error:regionError}=await c.from("demo_service_areas").select("id,active").eq("id",normalizedValue.regionId).maybeSingle();
 if(regionError)throw regionError;
 if(!region)throw new DemoAreaPlanningServerError("region_not_found");
 if(!region.active&&existing?.region_id!==normalizedValue.regionId)throw new DemoAreaPlanningServerError("inactive_region");
 if(normalizedValue.cityId){
  const{data:city,error:cityError}=await c.from("demo_service_area_cities").select("id,region_id,active").eq("id",normalizedValue.cityId).maybeSingle();
  if(cityError)throw cityError;
  if(!city)throw new DemoAreaPlanningServerError("city_not_found");
  if(city.region_id!==normalizedValue.regionId)throw new DemoAreaPlanningServerError("city_region_mismatch");
  if(!city.active&&existing?.city_id!==normalizedValue.cityId)throw new DemoAreaPlanningServerError("inactive_city");
 }
 const{data,error}=await c.from("demo_area_assignments").upsert({service_date:normalizedValue.serviceDate,region_id:normalizedValue.regionId,city_id:normalizedValue.cityId,custom_city:normalizedValue.customCity,internal_note:normalizedValue.internalNote,updated_at:new Date().toISOString()},{onConflict:"service_date"}).select(areaAssignmentColumns).single();
 if(error)throw error;
 return mapAreaAssignment(data as Record<string,unknown>);
}

export async function clearDemoAreaAssignment(serviceDate:string){
 const{error}=await getSupabaseServiceClient().from("demo_area_assignments").delete().eq("service_date",serviceDate);
 if(error)throw error;
}

export async function saveDemoServiceArea(value:DemoServiceAreaInput,id?:string){
 if(id===CUSTOM_DEMO_AREA_ID)throw new DemoAreaPlanningServerError("reserved_area");
 const c=getSupabaseServiceClient();
 const payload={name:value.name,description:value.description,active:value.active,sort_order:value.sortOrder,updated_at:new Date().toISOString()};
 const query=id?c.from("demo_service_areas").update(payload).eq("id",id):c.from("demo_service_areas").insert(payload);
 const{data,error}=await query.select(serviceAreaColumns).maybeSingle();
 if(error)throw error;
 if(!data)throw new DemoAreaPlanningServerError("region_not_found");
 return mapServiceArea(data as Record<string,unknown>);
}

export async function saveDemoServiceAreaCity(regionId:string,value:DemoServiceAreaCityInput,id?:string){
 if(regionId===CUSTOM_DEMO_AREA_ID)throw new DemoAreaPlanningServerError("reserved_area");
 const c=getSupabaseServiceClient();
 const{data:region,error:regionError}=await c.from("demo_service_areas").select("id").eq("id",regionId).maybeSingle();
 if(regionError)throw regionError;
 if(!region)throw new DemoAreaPlanningServerError("region_not_found");
 const payload={region_id:regionId,name:value.name,state_abbreviation:value.stateAbbreviation,active:value.active,sort_order:value.sortOrder,updated_at:new Date().toISOString()};
 const query=id?c.from("demo_service_area_cities").update(payload).eq("id",id).eq("region_id",regionId):c.from("demo_service_area_cities").insert(payload);
 const{data,error}=await query.select(serviceAreaCityColumns).maybeSingle();
 if(error)throw error;
 if(!data)throw new DemoAreaPlanningServerError("city_not_found");
 return mapServiceAreaCity(data as Record<string,unknown>);
}
