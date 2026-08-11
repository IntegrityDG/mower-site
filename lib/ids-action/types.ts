export const IDS_ACTION_CATEGORIES = ["Equipment Demo","Customer Delivery","Installation / Deployment","Commercial Project","Service / Support","Event","Other"] as const;
export const IDS_ACTION_MEDIA_TYPES = ["image","video"] as const;
export type IdsActionCategory = typeof IDS_ACTION_CATEGORIES[number];
export type IdsActionMediaType = typeof IDS_ACTION_MEDIA_TYPES[number];
export interface IdsActionMedia { id:string; entryId:string; mediaType:IdsActionMediaType; mediaUrl:string; storagePath:string|null; thumbnailUrl:string|null; altText:string; sortOrder:number; createdAt:string; }
export interface IdsActionEntry { id:string; title:string; description:string|null; category:IdsActionCategory; location:string|null; eventDate:string|null; featured:boolean; published:boolean; customerPermissionConfirmed?:boolean; sortOrder:number; createdAt:string; updatedAt:string; media:IdsActionMedia[]; }
export interface IdsActionInput { title:string; description:string|null; category:IdsActionCategory; location:string|null; eventDate:string|null; featured:boolean; published:boolean; customerPermissionConfirmed:boolean; sortOrder:number; }
