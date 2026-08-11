import { IDS_ACTION_CATEGORIES, type IdsActionInput } from "./types";
const text=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max+1):"";
export function validateIdsActionEntry(input:unknown):{ok:true;value:IdsActionInput}|{ok:false;errors:Record<string,string>}{
 const b=(input&&typeof input==="object"?input:{}) as Record<string,unknown>; const errors:Record<string,string>={};
 const value={title:text(b.title,120),description:text(b.description,2000)||null,category:text(b.category,80) as IdsActionInput["category"],location:text(b.location,120)||null,eventDate:text(b.eventDate,10)||null,featured:b.featured===true,published:b.published===true,customerPermissionConfirmed:b.customerPermissionConfirmed===true,sortOrder:Number.isInteger(Number(b.sortOrder))?Number(b.sortOrder):100};
 if(!value.title||value.title.length>120)errors.title="Title is required and must be 120 characters or fewer.";
 if(!IDS_ACTION_CATEGORIES.includes(value.category))errors.category="Select a valid category.";
 if(value.description&&value.description.length>2000)errors.description="Description must be 2,000 characters or fewer.";
 if(value.location&&value.location.length>120)errors.location="Location must be 120 characters or fewer.";
 if(value.eventDate&&!/^\d{4}-\d{2}-\d{2}$/.test(value.eventDate))errors.eventDate="Choose a valid event date.";
 if(value.sortOrder<0||value.sortOrder>100000)errors.sortOrder="Sort order is invalid.";
 if(value.published&&["Customer Delivery","Installation / Deployment"].includes(value.category)&&!value.customerPermissionConfirmed)errors.customerPermissionConfirmed="Customer or property media permission must be confirmed before publishing this category.";
 return Object.keys(errors).length?{ok:false,errors}:{ok:true,value};
}
export const IDS_ACTION_IMAGE_TYPES={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"} as const;
export const IDS_ACTION_MAX_IMAGE_BYTES=50*1024*1024;
export const IDS_ACTION_MAX_IMAGE_DIMENSION=3200;
export function validateMediaInput(input:unknown){const b=(input&&typeof input==="object"?input:{}) as Record<string,unknown>;const altText=text(b.altText,200),sortOrder=Number(b.sortOrder);if(b.mediaType!=="image"||typeof b.mediaUrl!=="string"||!/^https:\/\//.test(b.mediaUrl)||typeof b.storagePath!=="string"||!/^entries\/[0-9a-f-]+\//.test(b.storagePath)||altText.length>200||!Number.isInteger(sortOrder)||sortOrder<0||sortOrder>100000)return null;return{mediaType:"image" as const,mediaUrl:b.mediaUrl,storagePath:b.storagePath,thumbnailUrl:null,altText,sortOrder};}
