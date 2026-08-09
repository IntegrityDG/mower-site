BEGIN;

ALTER TABLE public.catalog_options
  ADD COLUMN IF NOT EXISTS admin_managed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accessory_listing_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accessory_tab text,
  ADD COLUMN IF NOT EXISTS accessory_image_url text,
  ADD COLUMN IF NOT EXISTS accessory_image_alt text,
  ADD COLUMN IF NOT EXISTS accessory_badge text,
  ADD COLUMN IF NOT EXISTS ids_exclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_in_builder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accessory_action_type text,
  ADD COLUMN IF NOT EXISTS accessory_action_label text,
  ADD COLUMN IF NOT EXISTS accessory_action_url text,
  ADD COLUMN IF NOT EXISTS accessory_price_text text,
  ADD COLUMN IF NOT EXISTS manufacturer_name text;

ALTER TABLE public.catalog_options DROP CONSTRAINT IF EXISTS catalog_options_accessory_tab_check;
ALTER TABLE public.catalog_options ADD CONSTRAINT catalog_options_accessory_tab_check CHECK (accessory_tab IS NULL OR accessory_tab IN ('lymow','yarbo','aftermarket'));
ALTER TABLE public.catalog_options DROP CONSTRAINT IF EXISTS catalog_options_accessory_action_type_check;
ALTER TABLE public.catalog_options ADD CONSTRAINT catalog_options_accessory_action_type_check CHECK (accessory_action_type IS NULL OR accessory_action_type IN ('builder','contact','external','none'));
ALTER TABLE public.catalog_options DROP CONSTRAINT IF EXISTS catalog_options_aftermarket_builder_check;
ALTER TABLE public.catalog_options ADD CONSTRAINT catalog_options_aftermarket_builder_check CHECK (accessory_tab <> 'aftermarket' OR (show_in_builder = false AND accessory_action_type <> 'builder'));
CREATE INDEX IF NOT EXISTS catalog_options_accessory_public_idx ON public.catalog_options(accessory_tab,accessory_listing_enabled,public_status,sort_order,name);
CREATE INDEX IF NOT EXISTS catalog_options_admin_managed_idx ON public.catalog_options(admin_managed) WHERE admin_managed;

CREATE TABLE IF NOT EXISTS public.accessory_catalog_settings (
 id text PRIMARY KEY CHECK (id='accessories'), lymow_enabled boolean NOT NULL DEFAULT true, lymow_label text NOT NULL DEFAULT 'Lymow',
 yarbo_enabled boolean NOT NULL DEFAULT true, yarbo_label text NOT NULL DEFAULT 'Yarbo', pandag_enabled boolean NOT NULL DEFAULT true,
 pandag_label text NOT NULL DEFAULT 'Pandag', pandag_message text NOT NULL DEFAULT 'Contact for Parts and Pricing', aftermarket_enabled boolean NOT NULL DEFAULT false,
 aftermarket_label text NOT NULL DEFAULT 'Aftermarket', featured_aftermarket_enabled boolean NOT NULL DEFAULT false, featured_aftermarket_image_url text,
 featured_aftermarket_image_alt text, featured_aftermarket_heading text, featured_aftermarket_description text, featured_aftermarket_ids_exclusive boolean NOT NULL DEFAULT false,
 aftermarket_disclaimer text NOT NULL DEFAULT 'Aftermarket Product Disclaimer: Integrity Distribution Systems (IDS) does not test, verify, or endorse any product listed in this section unless the product is specifically identified as an IDS Exclusive. All product claims, specifications, warranties, guarantees, availability, and pricing are the sole responsibility of the product''s manufacturer or supplier.',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK (length(btrim(aftermarket_disclaimer))>0)
);
ALTER TABLE public.accessory_catalog_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accessory_catalog_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.accessory_catalog_settings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.accessory_catalog_settings FROM service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.accessory_catalog_settings TO service_role;
INSERT INTO public.accessory_catalog_settings(id) VALUES('accessories') ON CONFLICT(id) DO NOTHING;

INSERT INTO public.catalog_products(slug,brand,name,public_status,sort_order,show_public_price,contact_for_pricing)
VALUES('ids-aftermarket','Aftermarket','Aftermarket Accessories','hidden',999,false,false)
ON CONFLICT(slug) DO UPDATE SET brand=EXCLUDED.brand,name=EXCLUDED.name,public_status='hidden',sort_order=999,show_public_price=false,contact_for_pricing=false,updated_at=now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.catalog_products WHERE slug = 'lymow-one-plus') THEN
    RAISE EXCEPTION 'Required accessory parent product is missing: lymow-one-plus';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalog_products WHERE slug = 'yarbo') THEN
    RAISE EXCEPTION 'Required accessory parent product is missing: yarbo';
  END IF;
END
$$;

-- Fields: tab, slug, name, price cents, description, badge, sort order, builder, contact pricing, price text.
WITH seed(tab,slug,name,price,description,badge,sort_order,builder,contact_price,price_text) AS (VALUES
('lymow','lymow-straight-blade-2','Rotary Blade Set for Lymow One Plus',2999,'Replacement rotary blade set for Lymow One Plus. One set includes two blades. Compatibility: Lymow One Plus only. Not compatible with Lymow One.','Replacement',1,true,false,NULL),
('lymow','lymow-battery-direct-charging-cable','Battery Direct Charging Cable',2999,'Direct charging cable designed for the Lymow One Plus 528Wh battery. Compatibility: Lymow One Plus battery only. Not compatible with the Lymow One battery.','Charging',2,true,false,NULL),
('lymow','lymow-rtk-extension-cable','RTK Station Extension Cable',1999,'RTK station extension cable. Compatibility: Lymow One and Lymow One Plus.','RTK',3,true,false,NULL),
('lymow','lymow-10a-charging-station-adapter','10A Charging Station Adapter',34900,'Replacement or additional 10A charging-station adapter. Includes a 10 m extension cable. Compatibility: Lymow One and Lymow One Plus.','Charging',4,true,false,NULL),
('lymow','lymow-battery-528wh','Lymow One Plus Battery',69900,'Replacement 528Wh battery designed for Lymow One Plus. Compatibility: Lymow One Plus only.','Replacement',5,true,false,NULL),
('lymow','lymow-tracks-pair','Lymow Track',13900,'Replacement track for compatible Lymow tracked mower systems. Compatibility: Lymow One and Lymow One Plus.','Replacement',6,true,false,NULL),
('lymow','lymow-rtk-reference-station','RTK Reference Station',19900,'Replacement or additional RTK reference-station set containing one RTK reference station and one RTK antenna. Compatibility: Lymow One and Lymow One Plus.','RTK',7,true,false,NULL),
('lymow','lymow-rtk-power-adapter','RTK Power Adapter',3299,'RTK power adapter. Compatibility: Lymow One and Lymow One Plus.','RTK',8,true,false,NULL),
('lymow','lymow-5a-charging-station-adapter','5A Charging Station Adapter',19900,'Replacement or additional 5A charging-station adapter. Includes a 10 m extension cable. Compatibility: Lymow One and Lymow One Plus.','Charging',9,true,false,NULL),
('lymow','lymow-skin-wrap-football-red','Lymow One Plus Custom Skin Wrap - Football Red',16900,'Lymow One Plus custom skin wrap with a durable matte PP top layer designed for outdoor wear and scratch resistance. Designed to adhere to steel and PE surfaces. Application is best above 5 C; material is rated for a broad operating-temperature range. Compatibility: Lymow One Plus.','Custom Wrap',10,true,false,NULL),
('lymow','lymow-skin-wrap-football-green','Lymow One Plus Custom Skin Wrap - Football Green',16900,'Lymow One Plus custom skin wrap with a durable matte PP top layer designed for outdoor wear and scratch resistance. Designed to adhere to steel and PE surfaces. Application is best above 5 C; material is rated for a broad operating-temperature range. Compatibility: Lymow One Plus.','Custom Wrap',11,true,false,NULL),
('lymow','lymow-skin-wrap-camouflage','Lymow One Plus Custom Skin Wrap - Camouflage',16900,'Lymow One Plus custom skin wrap with a durable matte PP top layer designed for outdoor wear and scratch resistance. Designed to adhere to steel and PE surfaces. Application is best above 5 C; material is rated for a broad operating-temperature range. Compatibility: Lymow One Plus.','Custom Wrap',12,true,false,NULL),
('lymow','lymow-skin-wrap-mech-red','Lymow One Plus Custom Skin Wrap - Mech Red',16900,'Lymow One Plus custom skin wrap with a durable matte PP top layer designed for outdoor wear and scratch resistance. Designed to adhere to steel and PE surfaces. Application is best above 5 C; material is rated for a broad operating-temperature range. Compatibility: Lymow One Plus.','Custom Wrap',13,true,false,NULL),
('lymow','lymow-skin-wrap-mech-green','Lymow One Plus Custom Skin Wrap - Mech Green',16900,'Lymow One Plus custom skin wrap with a durable matte PP top layer designed for outdoor wear and scratch resistance. Designed to adhere to steel and PE surfaces. Application is best above 5 C; material is rated for a broad operating-temperature range. Compatibility: Lymow One Plus.','Custom Wrap',14,true,false,NULL),
('yarbo','yarbo-straight-blades-bolts-pro-2pc','Straight Blades & Bolts - 2 Pcs',9000,'Optional straight-blade and bolt set for the Lawn Mower Pro Module, intended for rough or overgrown grass conditions.','Replacement',1,true,false,NULL),
('yarbo','yarbo-rtk-antenna-pro','RTK Antenna Pro for Data Center & Rover',6600,'Enhanced high-precision GNSS antenna for compatible Yarbo Data Center and Core/rover equipment. Designed for outdoor use.','RTK',2,true,false,NULL),
('yarbo','yarbo-back-brace-mount','Back Brace Mount',14900,'Durable towing/three-point-style rear mount for compatible Yarbo Core utility use.','Utility',3,true,false,NULL),
('yarbo','yarbo-snow-plow-blade','Snow Plow Blade',15900,'Plow blade designed for use with the Yarbo Snow Blower Module. Intended for packed snow and light material-moving tasks such as dirt, gravel, or mulch. Requires the Snow Blower Module. Not a standalone Yarbo module.','Snow',4,true,false,NULL),
('yarbo','yarbo-cutting-blades-bolts-40pc','Cutting Blades & Bolts - 40 Pcs',3900,'Replacement cutting-blade and bolt set for the standard Lawn Mower Module. Includes 40 blades with corresponding bolts.','Replacement',5,true,false,NULL),
('yarbo','yarbo-weighted-side-plate','Weighted Side Plate',9900,'Weighted side-plate set designed to improve traction and stability. Approximately 9.4 lb per plate.','Traction',6,true,false,NULL),
('yarbo','yarbo-flexible-rtk-antenna-mount','Flexible RTK Antenna Mount',2600,'Flexible antenna mounting base for stable positioning on compatible Yarbo RTK equipment.','RTK',7,true,false,NULL),
('yarbo','yarbo-cutting-disc-bolts','Cutting Disc & Bolts',2900,'Replacement cutting-disc assembly with mounting bolts for the standard Lawn Mower Module.','Replacement',8,true,false,NULL),
('yarbo','yarbo-track-grease-200ml','Yarbo Track Grease - 200 ml',4900,'Track-system grease formulated for Yarbo tracked equipment with water and temperature resistance.','Maintenance',9,true,false,NULL),
('yarbo','yarbo-shear-cotter-pins-set-8','Shear Pins & Cotter Pins Set - 8',2900,'Replacement set containing eight shear pins and eight cotter pins for compatible Yarbo Snow Blower equipment.','Replacement',10,true,false,NULL),
('yarbo','yarbo-rtk-antenna','RTK Antenna for Data Center & Rover',3000,'Weather-resistant GNSS antenna for compatible Yarbo Data Center and Core/rover equipment.','RTK',11,true,false,NULL),
('yarbo','yarbo-tow-hitch','Tow Hitch',6900,'Replacement or additional Yarbo tow hitch for compatible Core utility use. Yarbo rates the hitch for towing applications up to 500 lb under appropriate conditions. The Tow Hitch may be included with a Yarbo Core purchase; this listing is for replacement/additional purchase.','Utility',12,true,false,NULL),
('yarbo','yarbo-core-cover','Core Cover',3900,'Protective weather-resistant cover for the Yarbo Core during storage or charging, with ventilation and securing straps.','Protection',13,true,false,NULL),
('yarbo','yarbo-halow-antenna-rover','HaLow Antenna for Rover',2200,'Long-range HaLow antenna for compatible Yarbo rover/Core communications.','Connectivity',14,true,false,NULL),
('yarbo','yarbo-lawn-mower-pro-cover','Lawn Mower Pro Module Cover',3000,'Protective cover for the Yarbo Lawn Mower Pro Module.','Protection',15,true,false,NULL),
('yarbo','yarbo-snow-blower-cover','Snow Blower Module Cover',3500,'Protective cover for the Yarbo Snow Blower Module.','Protection',16,true,false,NULL),
('yarbo','yarbo-smart-assist-cover','Smart Assist Module Cover',2900,'Protective cover for the Yarbo Smart Assist Module.','Protection',17,true,false,NULL),
('yarbo','yarbo-battery-power-cord','Battery Power Cord',5900,'Direct battery charging cable for compatible Yarbo batteries with charging-status indication.','Charging',18,true,false,NULL),
('yarbo','yarbo-scraper-bar','Scraper Bar',5900,'Wear-resistant steel scraper bar designed for efficient snow and ice clearing with compatible Yarbo snow equipment.','Replacement',19,true,false,NULL),
('yarbo','yarbo-snow-track','Snow Track',18900,'Heavy-duty track designed for improved traction in snow and icy conditions. Manufacturer material states support for slopes up to approximately 36%. Not compatible with the Yarbo 2023 version.','Traction',20,true,false,NULL),
('yarbo','yarbo-battery-38-4ah','38.4Ah Battery',119900,'38.4Ah NCM lithium-ion replacement/additional battery for compatible Yarbo equipment. Manufacturer material indicates operation from approximately -25 C to 45 C and wireless charging capability.','Battery',21,true,false,NULL),
('yarbo','yarbo-anti-slip-track-studs','Anti-Slip Studs for Rubber Track',2900,'Set of 100 hardened-steel studs designed to improve traction on icy surfaces.','Traction',22,true,false,NULL),
('yarbo','yarbo-docking-station','Docking Station',89900,'Weather-resistant Yarbo docking/charging station with charging and power-status indication. Includes mounting hardware/ramps as supplied by the manufacturer.','Charging',23,true,false,NULL),
('yarbo','yarbo-cap','Yarbo Cap',2900,'Yarbo branded cap.','Merchandise',24,false,false,NULL),
('yarbo','yarbo-blower-cover','Blower Module Cover',3000,'Protective cover for the Yarbo Blower Module.','Protection',25,true,false,NULL),
('yarbo','yarbo-halow-antenna-data-center','HaLow Antenna for Data Center',2200,'Sub-1GHz Wi-Fi HaLow antenna for compatible Yarbo Data Center communications.','Connectivity',26,true,false,NULL),
('yarbo','yarbo-bluetooth-antenna-data-center','Bluetooth Antenna for Data Center',2200,'Bluetooth antenna for compatible Yarbo Data Center equipment.','Connectivity',27,true,false,NULL),
('yarbo','yarbo-remote-controller','Remote Controller',5900,'Rechargeable weather-resistant remote controller for compatible Yarbo equipment. Manufacturer material indicates approximately 100 m line-of-sight range.','Control',28,true,false,NULL),
('yarbo','yarbo-lawn-track','Lawn Track',13900,'Low-ground-pressure replacement lawn track designed for stable operation on turf. Manufacturer material states operation on slopes up to approximately 45%. Not compatible with Yarbo 2023 version.','Replacement',29,true,false,NULL),
('yarbo','yarbo-snow-shovel','Snow Shovel',2900,'Snow shovel accessory intended to help clear accumulated snow and reduce clogging around compatible Yarbo snow equipment.','Snow',30,true,false,NULL),
('yarbo','yarbo-t-shirt','Yarbo T-shirt',3900,'Yarbo branded T-shirt. Available sizing: 2XL, 3XL, 4XL, 5XL, 6XL, and 7XL. Contact IDS for size availability.','Merchandise',31,false,false,NULL),
('yarbo','yarbo-wired-charger','Wired Charger',7900,'Wired charger for compatible Yarbo Core batteries. Manufacturer material lists 100-240V input and 42V DC output with slower full-charge operation than the docking system.','Charging',32,true,false,NULL),
('yarbo','yarbo-pro-cutting-discs-bolts-2pc','Cutting Discs & Bolts for Lawn Mower Pro Module - 2 Pcs',4900,'Replacement set containing two cutting discs and mounting bolts for the Lawn Mower Pro Module.','Replacement',33,true,false,NULL),
('yarbo','yarbo-data-center','Data Center',21900,'Yarbo Data Center used to provide compatible Yarbo Core systems with precise navigation/reference data.','Navigation',34,true,false,NULL),
('yarbo','yarbo-poe-power-adapter','POE Power Adapter',3200,'Power-over-Ethernet adapter for compatible Yarbo Data Center equipment, providing LAN and POE connectivity. Manufacturer material describes this adapter for indoor use.','Connectivity',35,true,false,NULL),
('yarbo','yarbo-smart-assist-module','Smart Assist Module',29900,'Yarbo Smart Assist add-on supporting Follow-Me, patrol-oriented operation, obstacle detection, monitoring, and alerts where supported by the platform.','Smart Accessory',36,true,false,NULL),
('yarbo','yarbo-trimmer-line-spool','Trimmer Line Spool',2900,'Replacement trimmer-line spool package for compatible Yarbo trimming equipment. Manufacturer material identifies a 1.6 mm spool system with multiple supported line thicknesses and a four-spool package.','Replacement',37,true,false,NULL),
('yarbo','yarbo-down-jacket','Yarbo Down Jacket',47900,'Yarbo branded down jacket.','Merchandise',38,false,false,NULL),
('yarbo','yarbo-4g-service','4G Service',NULL,'Yarbo 4G connectivity service for supported equipment and service areas.','Service',39,false,false,'Unavailable at this time')
), parents AS (SELECT id,CASE slug WHEN 'lymow-one-plus' THEN 'lymow' WHEN 'yarbo' THEN 'yarbo' END tab FROM public.catalog_products WHERE slug IN('lymow-one-plus','yarbo'))
INSERT INTO public.catalog_options(product_id,option_group_id,option_slug,name,description,public_status,is_required,is_included,is_recommended,default_quantity,minimum_quantity,maximum_quantity,regular_price_cents,sale_price_cents,show_public_price,contact_for_pricing,sort_order,admin_managed,accessory_listing_enabled,accessory_tab,accessory_image_url,accessory_image_alt,accessory_badge,ids_exclusive,show_in_builder,accessory_action_type,accessory_action_label,accessory_price_text,manufacturer_name)
SELECT p.id,NULL,s.slug,s.name,s.description,'active',false,false,false,0,0,NULL,s.price,NULL,CASE WHEN s.slug = 'yarbo-4g-service' THEN false ELSE NOT s.contact_price END,s.contact_price,s.sort_order,true,true,s.tab,'/images/accessories/' || s.tab || '/' || s.slug || '.webp',s.name,s.badge,false,s.builder,CASE WHEN s.slug = 'yarbo-4g-service' THEN 'none' WHEN s.builder THEN 'builder' ELSE 'contact' END,CASE WHEN s.slug = 'yarbo-4g-service' THEN NULL WHEN s.builder THEN 'View / Purchase' ELSE 'Contact IDS' END,s.price_text,CASE s.tab WHEN 'lymow' THEN 'Lymow' ELSE 'Yarbo' END FROM seed s JOIN parents p USING(tab)
ON CONFLICT(product_id,option_slug) DO UPDATE SET option_group_id=NULL,name=EXCLUDED.name,description=EXCLUDED.description,public_status='active',default_quantity=0,minimum_quantity=0,maximum_quantity=NULL,regular_price_cents=EXCLUDED.regular_price_cents,sale_price_cents=NULL,sale_starts_at=NULL,sale_ends_at=NULL,promotion_label=NULL,show_public_price=EXCLUDED.show_public_price,contact_for_pricing=EXCLUDED.contact_for_pricing,sort_order=EXCLUDED.sort_order,admin_managed=true,accessory_listing_enabled=true,accessory_tab=EXCLUDED.accessory_tab,accessory_image_url=COALESCE(public.catalog_options.accessory_image_url,EXCLUDED.accessory_image_url),accessory_image_alt=COALESCE(public.catalog_options.accessory_image_alt,EXCLUDED.accessory_image_alt),accessory_badge=EXCLUDED.accessory_badge,ids_exclusive=false,show_in_builder=EXCLUDED.show_in_builder,accessory_action_type=EXCLUDED.accessory_action_type,accessory_action_label=EXCLUDED.accessory_action_label,accessory_action_url=NULL,accessory_price_text=EXCLUDED.accessory_price_text,manufacturer_name=EXCLUDED.manufacturer_name,updated_at=now();

-- Internal Lymow variant-definition charger mirrors are explicitly excluded.
UPDATE public.catalog_options SET admin_managed=false,accessory_listing_enabled=false,accessory_tab=NULL,show_in_builder=false,accessory_action_type=NULL WHERE option_slug IN('lymow-5a-charger','lymow-10a-charger');

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('ids-accessory-images','ids-accessory-images',true,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=5242880,allowed_mime_types=EXCLUDED.allowed_mime_types;
-- No storage.objects INSERT/UPDATE/DELETE policy is created: only service-role server code may upload.

COMMIT;
