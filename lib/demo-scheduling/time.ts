import { DEMO_TIMEZONE, type DemoSlot } from "./types";
const MILLISECONDS_PER_MINUTE=60000;
const partsFormatter=new Intl.DateTimeFormat("en-CA",{timeZone:DEMO_TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
const labelFormatter=new Intl.DateTimeFormat("en-US",{timeZone:DEMO_TIMEZONE,hour:"numeric",minute:"2-digit"});
const dateFormatter=new Intl.DateTimeFormat("en-US",{timeZone:DEMO_TIMEZONE,weekday:"long",year:"numeric",month:"long",day:"numeric"});
function parts(date:Date){return Object.fromEntries(partsFormatter.formatToParts(date).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));}
export function centralLocalToUtc(date:string,time:string){const [y,m,d]=date.split("-").map(Number),[h,min]=time.split(":").map(Number);if(!y||!m||!d||h<0||h>23||min<0||min>59)return null;const desired=Date.UTC(y,m-1,d,h,min);let instant=desired;for(let i=0;i<2;i++){const p=parts(new Date(instant));const rendered=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute));instant+=desired-rendered;}const check=parts(new Date(instant));if(Number(check.year)!==y||Number(check.month)!==m||Number(check.day)!==d||Number(check.hour)!==h||Number(check.minute)!==min)return null;return new Date(instant);}
export function centralDate(date:Date){const p=parts(date);return `${p.year}-${p.month}-${p.day}`;}
export function centralWeekday(date:string){const instant=centralLocalToUtc(date,"12:00");return instant?["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(new Intl.DateTimeFormat("en-US",{timeZone:DEMO_TIMEZONE,weekday:"short"}).format(instant)):-1;}
export function addDays(date:string,amount:number){const [y,m,d]=date.split("-").map(Number);return new Date(Date.UTC(y,m-1,d+amount)).toISOString().slice(0,10);}
export function minutes(time:string){const[h,m]=time.slice(0,5).split(":").map(Number);return h*60+m;}
export function timeFromMinutes(value:number){return `${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;}
export function endAtForDuration(start:Date,durationMinutes:number){return new Date(start.getTime()+durationMinutes*MILLISECONDS_PER_MINUTE);}
export function slotFromLocal(date:string,time:string,duration:number):DemoSlot|null{const start=centralLocalToUtc(date,time);if(!start)return null;const end=endAtForDuration(start,duration);return{startAt:start.toISOString(),endAt:end.toISOString(),date,timeLabel:labelFormatter.format(start)};}
export function humanDemoTime(start:string,end:string){return `${dateFormatter.format(new Date(start))}, ${labelFormatter.format(new Date(start))} – ${labelFormatter.format(new Date(end))} CT`;}
