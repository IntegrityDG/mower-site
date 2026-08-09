/* eslint-disable @typescript-eslint/no-explicit-any */
import { validateItem, validateSettings } from "./validation";
type Deps = { isAdmin: () => Promise<boolean>; read: () => Promise<any>; saveSettings: (v:any)=>Promise<any>; saveItem:(v:any,id?:string)=>Promise<any>; remove:(id:string,removed:boolean)=>Promise<any> };
const json = (body: unknown, status = 200) => Response.json(body, { status });
export function createAccessoryAdminHandlers(d: Deps) { return {
  async GET() { if (!(await d.isAdmin())) return json({error:"Unauthorized"},401); try { return json(await d.read()); } catch { return json({error:"Accessories are unavailable."},503); } },
  async PUT(request:Request) { if (!(await d.isAdmin())) return json({error:"Unauthorized"},401); const value=validateSettings(await request.json().catch(()=>null)); if(!value)return json({error:"Invalid accessory settings."},400); try{return json({settings:await d.saveSettings(value)})}catch{return json({error:"Settings could not be saved."},500)} },
  async POST(request:Request) { if (!(await d.isAdmin())) return json({error:"Unauthorized"},401); const value=validateItem(await request.json().catch(()=>null)); if(!value)return json({error:"Invalid accessory item."},400); try{return json({item:await d.saveItem(value)},201)}catch{return json({error:"Accessory could not be created."},500)} },
  async PATCH(request:Request,id:string) { if (!(await d.isAdmin())) return json({error:"Unauthorized"},401); const body=await request.json().catch(()=>null) as any; if(body && typeof body.removed==="boolean")try{return json({item:await d.remove(id,body.removed)})}catch{return json({error:"Accessory status could not be changed."},500)} const value=validateItem(body); if(!value)return json({error:"Invalid accessory item."},400); try{return json({item:await d.saveItem(value,id)})}catch{return json({error:"Accessory could not be updated."},500)} },
}; }
