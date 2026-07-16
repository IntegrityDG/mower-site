import type { ExtractionResult, FetchResult, MonitoredField, SourceTarget } from "../types";

const labels: Partial<Record<MonitoredField, RegExp>> = {
  model_number: /model(?: number| no\.?)/i, cutting_width: /cutting width/i,
  cutting_height: /cutting height(?: range)?/i, battery: /battery(?: capacity| type)?/i,
  runtime: /(?:run|working|operating)\s*time/i, charging_time: /charg(?:e|ing) time/i,
  recommended_area: /recommended (?:area|lawn size|coverage)/i, maximum_area: /max(?:imum)? (?:area|coverage|lawn size)/i,
  slope_capability: /(?:max(?:imum)? )?slope/i, navigation_system: /navigation|rtk|gps|lidar/i,
  obstacle_detection: /obstacle (?:detection|avoidance)/i, drive_system: /drive system|tracked drive/i,
  dimensions: /dimensions|product size/i, weight: /(?:net )?weight/i, warranty: /warranty/i,
};

function clean(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }
function allowed(source: SourceTarget, field: MonitoredField) {
  const configured = source.fields_to_monitor;
  return Object.keys(configured).length === 0 || configured[field] === true || (Array.isArray(configured.fields) && configured.fields.includes(field));
}

export function extractConservatively(source: SourceTarget, fetched: FetchResult, brand: string): ExtractionResult {
  if (/application\/pdf/i.test(fetched.contentType)) return { values: [], notes: ["PDF detected; first version records the snapshot but does not parse binary documents."] };
  const values: ExtractionResult["values"] = [];
  const notes: string[] = [];
  const html = fetched.body;
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = clean(html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i)?.[1] ?? "");
  if (title && allowed(source, "name")) values.push({ field: "name", value: title.replace(new RegExp(`\\s*[|–—-]\\s*${brand}.*$`, "i"), ""), confidence: 60, notes: "Detected from page title; review required." });
  if (description && allowed(source, "short_description")) values.push({ field: "short_description", value: description.slice(0, 500), confidence: 55, notes: "Detected from description metadata; rewrite before publishing." });
  for (const [field, label] of Object.entries(labels) as [MonitoredField, RegExp][]) {
    if (!allowed(source, field)) continue;
    const match = clean(html).match(new RegExp(`${label.source}\\s*[:–—-]?\\s*([^|•]{2,120})`, "i"));
    if (match?.[1]) values.push({ field, value: match[1].trim(), confidence: 50, notes: "Detected near a labeled manufacturer specification; verify against the source." });
  }
  const images = [...html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/gi)].map((match) => match[1]);
  if (allowed(source, "official_image_url")) for (const image of images.slice(0, 5)) values.push({ field: "official_image_url", value: new URL(image, fetched.url).href, confidence: 65, notes: `URL only; image download permission is ${source.allow_image_download ? "recorded as allowed" : "not recorded"}.` });
  const documents = [...html.matchAll(/href=["']([^"']+\.(?:pdf)(?:\?[^"']*)?)["']/gi)].map((match) => new URL(match[1], fetched.url).href);
  if (allowed(source, "official_document_url")) for (const document of [...new Set(documents)].slice(0, 5)) values.push({ field: "official_document_url", value: document, confidence: 65, notes: "Official-page document link; review document type and reuse rights." });
  if (!values.length) notes.push("No fields met the conservative extraction threshold.");
  return { values, notes };
}
