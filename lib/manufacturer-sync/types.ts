export const supportedManufacturers = ["Lymow", "Yarbo", "Pandag"] as const;
export type Manufacturer = (typeof supportedManufacturers)[number];

export type MonitoredField =
  | "name" | "model_number" | "short_description" | "cutting_width"
  | "cutting_height" | "battery" | "runtime" | "charging_time"
  | "recommended_area" | "maximum_area" | "slope_capability"
  | "navigation_system" | "obstacle_detection" | "drive_system"
  | "dimensions" | "weight" | "warranty" | "official_image_url"
  | "official_document_url";

export type ExtractedValue = { field: MonitoredField; value: string; confidence: number; notes: string };
export type ExtractionResult = { values: ExtractedValue[]; notes: string[] };
export type SourceTarget = {
  id: string; target_type: string; product_id: string | null; variant_id: string | null;
  option_id: string | null; package_id: string | null; service_id: string | null;
  product_service_id: string | null; source_brand: string | null;
  source_name: string | null; source_url: string | null; source_kind: string;
  fields_to_monitor: Record<string, unknown>; allow_automated_fetch: boolean;
  allow_image_download: boolean; manual_only: boolean;
};
export type PublicTarget = { id: string; table: string; name: string | null; values: Record<string, unknown> };
export type FetchResult = { url: string; status: number; contentType: string; body: string; contentHash: string };
export type ManufacturerAdapter = { extract(source: SourceTarget, fetched: FetchResult): ExtractionResult };
