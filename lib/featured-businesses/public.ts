import type { FeaturedBusiness } from "./types";

export const PUBLIC_BUSINESS_COLUMNS = "id,business_name,description,operating_region,image_url,image_path,image_alt,website_url,facebook_url,phone,address,referral_code,special_offer,is_public,is_featured,is_archived,sort_order,created_at,updated_at";
export function toFeaturedBusiness(row: Record<string, unknown>): FeaturedBusiness {
  return { id:String(row.id), businessName:String(row.business_name), description:String(row.description), operatingRegion:row.operating_region as string|null, imageUrl:row.image_url as string|null, imagePath:row.image_path as string|null, imageAlt:row.image_alt as string|null, websiteUrl:row.website_url as string|null, facebookUrl:row.facebook_url as string|null, phone:row.phone as string|null, address:row.address as string|null, referralCode:row.referral_code as string|null, specialOffer:row.special_offer as string|null, isPublic:Boolean(row.is_public), isFeatured:Boolean(row.is_featured), isArchived:Boolean(row.is_archived), sortOrder:Number(row.sort_order), createdAt:String(row.created_at), updatedAt:String(row.updated_at) };
}
