import type { FeaturedBusiness } from "./types";

export type BusinessFilters={q?:string;state?:string;county?:string;areaCode?:string};
export function matchesBusiness(business:FeaturedBusiness,filters:BusinessFilters){
 const q=filters.q?.trim().toLocaleLowerCase(),state=filters.state?.toUpperCase(),county=filters.county?.trim(),area=filters.areaCode?.trim();
 if(area&&business.phoneAreaCode!==area)return false;
 if(state){const serves=business.serviceAreas.some(item=>item.stateCode===state);if(business.businessState!==state&&!serves)return false;}
 if(county){if(!state)return false;const hasAreas=business.serviceAreas.length>0;const serves=business.serviceAreas.some(item=>item.stateCode===state&&(item.statewide||item.countyName===county));const fallback=!hasAreas&&business.businessState===state&&business.businessCounty===county;if(!serves&&!fallback)return false;}
 if(q){const haystack=[business.businessName,business.description,business.operatingRegion,business.businessCity,business.businessState,business.businessCounty,business.postalCode,...business.serviceAreas.flatMap(item=>[item.stateCode,item.countyName,item.statewide?"statewide":null])].filter(Boolean).join(" ").toLocaleLowerCase();if(!q.split(/\s+/).every(term=>haystack.includes(term)))return false;}
 return true;
}
export function filterBusinesses(businesses:FeaturedBusiness[],filters:BusinessFilters){return businesses.filter(item=>matchesBusiness(item,filters));}
