import { sendIdsNotification } from "@/lib/email";
import { serviceAreaLabel } from "./location";
import type { FeaturedBusinessRequestInput } from "./request-types";

export async function notifyFeaturedBusinessRequest(value:FeaturedBusinessRequestInput,sender=sendIdsNotification){
 try{await sender({subject:`IDS Website — New Featured Business Request — ${value.businessName}`,text:["NEW FEATURED BUSINESS REQUEST",`Business: ${value.businessName}`,`Contact: ${value.contactName}`,`Email: ${value.contactEmail}`,"",`Business Location: ${value.businessCounty}, ${value.businessState}`,`City: ${value.businessCity??"Not supplied"}`,`ZIP: ${value.postalCode??"Not supplied"}`,`Public Phone: ${value.phone??"Not supplied"}`,`Area Code: ${value.phoneAreaCode??"Not supplied"}`,`Operating Region: ${value.operatingRegion??"Not supplied"}`,"Service Areas:",...value.serviceAreas.map(area=>`- ${serviceAreaLabel(area)}`),`Address: ${value.address??"Not supplied"}`,`Website: ${value.websiteUrl??"Not supplied"}`,`Facebook: ${value.facebookUrl??"Not supplied"}`,`Special Offer: ${value.specialOffer??"Not supplied"}`,`Additional Notes: ${value.additionalNotes??"Not supplied"}`,"Logo: Uploaded","Review at: /admin/featured-businesses"].join("\n")});}catch{console.error("Featured business request notification failed");}
}
