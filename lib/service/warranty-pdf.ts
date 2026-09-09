import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { finalWarrantyReportAllowed, serviceMoney } from "./policy";
import type { ServiceCase, ServiceInvoice } from "./types";

export type WarrantyReportSnapshot = { case: ServiceCase; invoice: ServiceInvoice; technicians: Record<string, string> };
export async function warrantyPdf(snapshot: WarrantyReportSnapshot): Promise<Uint8Array> {
  const { case: job, invoice, technicians } = snapshot;
  if (!finalWarrantyReportAllowed(job.status, job.warranty_status, invoice.status) || !invoice.totals || !invoice.finalized_at || invoice.totals.customerDueCents !== 0) throw new Error("A resolved, finalized, covered warranty invoice is required.");
  const pdf = await PDFDocument.create();
  pdf.setTitle(`IDS Warranty Service ${job.case_number}`); pdf.setAuthor("Integrity Distribution Systems");
  pdf.setSubject("Final warranty service report - customer due $0.00"); pdf.setCreator("IDS Service"); pdf.setProducer("IDS Service");
  const created = new Date(invoice.finalized_at); pdf.setCreationDate(created); pdf.setModificationDate(created);
  const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.13, 0.2), green = rgb(0.03, 0.39, 0.28), muted = rgb(0.35, 0.4, 0.45);
  const width = 612, height = 792, margin = 46, contentWidth = width - 2 * margin;
  let page: PDFPage; let y = 0;
  // Preserve unsupported code points explicitly rather than silently losing
  // customer/equipment data with replacement glyphs in the standard PDF fonts.
  const printable = (value: string) => [...value.normalize("NFC")].map(char => {
    try { regular.encodeText(char); return char; } catch { return `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`; }
  }).join("");
  function newPage() {
    page = pdf.addPage([width, height]); y = height - margin;
    page.drawText("INTEGRITY DISTRIBUTION SYSTEMS", { x: margin, y, size: 13, font: bold, color: green }); y -= 19;
    page.drawText("www.integrityautomowers.com  |  Service.IDS@proton.me", { x: margin, y, size: 9, font: regular, color: muted }); y -= 18;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: green }); y -= 24;
  }
  function ensure(space = 18) { if (y - space < 58) newPage(); }
  function wrap(value: string, font: PDFFont, size: number, available = contentWidth) {
    const output: string[] = [];
    for (const paragraph of printable(value).split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const trial = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(trial, size) <= available) { line = trial; continue; }
        if (line) output.push(line);
        line = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > available) { output.push(line); line = ""; }
          line += char;
        }
      }
      output.push(line);
    }
    return output;
  }
  function paragraph(value: string, font = regular, size = 10, color = ink) {
    for (const line of wrap(value || "Not recorded", font, size)) { ensure(size + 5); page.drawText(line, { x: margin, y, font, size, color }); y -= size + 5; }
    y -= 5;
  }
  function heading(value: string) { ensure(44); y -= 5; paragraph(value.toUpperCase(), bold, 11, green); }
  function field(label: string, value: string | null | undefined) { paragraph(`${label}: ${value || "Not recorded"}`); }
  function charge(description: string, amount: number) {
    const amountText = serviceMoney(amount); const rows = wrap(description, regular, 10, contentWidth - 95);
    rows.forEach((line, index) => {
      ensure(16); page.drawText(line, { x: margin, y, font: regular, size: 10, color: ink });
      if (index === 0) page.drawText(amountText, { x: width - margin - bold.widthOfTextAtSize(amountText, 10), y, font: bold, size: 10, color: ink });
      y -= 15;
    }); y -= 5;
  }
  newPage();
  paragraph("FINAL WARRANTY SERVICE REPORT", bold, 18);
  paragraph("WARRANTY SERVICE - CUSTOMER DUE $0.00", bold, 13, green);
  field("Service case", job.case_number); field("Invoice", invoice.id);
  field("Finalized", invoice.finalized_at); field("Technical completion", job.resolved_at);
  heading("Customer and equipment");
  field("Customer", job.customer_name); field("Phone", job.customer_phone); field("Email", job.customer_email); field("Address", job.address);
  field("Manufacturer", job.equipment.manufacturer); field("Model", job.equipment.model); field("Serial number", job.equipment.serial);
  field("Approximate purchase date", job.equipment.purchaseDate); field("Purchased from", job.equipment.purchasedFrom);
  field("Warranty", "Verified - equipment and required Service covered");
  field("Arrangement", job.arrangement === "onsite_ids_approved" ? "On-Site - IDS Approved" : job.arrangement === "remote" ? "Remote warranty assistance" : "Shop Drop-Off");
  field("Warranty review", job.warranty_review_notes);
  const involved = [...new Set(invoice.sheet.labor.map(line => line.technicianId ? technicians[line.technicianId] ?? "Historical technician" : "Master Admin"))];
  field("Technician(s)", involved.join(", ") || (job.assigned_staff_id ? technicians[job.assigned_staff_id] : "Master Admin"));
  heading("Issue and technical work"); field("Issue", job.issue_notes); field("Diagnosis", invoice.sheet.diagnosis);
  field("Work performed", invoice.sheet.workPerformed); field("Testing", invoice.sheet.testing);
  field("Resolution", invoice.sheet.resolution); field("Case resolution notes", job.resolution_notes);
  heading("Labor value");
  for (const line of invoice.sheet.labor) field(line.date, `${line.minutes} active minutes - ${line.description} (${line.technicianId ? technicians[line.technicianId] ?? "Historical technician" : "Master Admin"})`);
  charge(`${invoice.totals.activeMinutes} active minutes at ${serviceMoney(invoice.pricing.warrantyHourlyCents)}/hour`, invoice.totals.laborCents);
  heading("Travel value");
  if (!invoice.sheet.travel.length) paragraph("No travel charged.");
  for (const line of invoice.sheet.travel) {
    const cost = invoice.totals.travelLines.find(item => item.id === line.id);
    charge(`${line.date} - ${line.category.replaceAll("_", " ")}; ${line.outboundMinutes} outbound + ${line.returnMinutes} return minutes; ${line.reason}`, cost?.amountCents ?? 0);
    field("Mapped route", line.mappedRoute);
  }
  heading("Parts, materials and consumables");
  if (!invoice.sheet.supplies.length) paragraph("No parts, materials or consumables charged.");
  for (const line of invoice.sheet.supplies) {
    charge(`${line.kind}: ${line.description}${line.partNumber ? ` (part ${line.partNumber})` : ""}; ${line.quantity} x ${serviceMoney(line.unitCents)}`, Math.round(line.quantity * line.unitCents));
    field("Authorization", line.authorization);
  }
  heading("Holds and authorizations"); field("Hold notes", invoice.sheet.holdNotes || "None"); field("Customer expense authorizations", invoice.sheet.authorizationNotes || "Covered warranty work");
  heading("Final accounting");
  charge("Labor value", invoice.totals.laborCents); charge("Travel value", invoice.totals.travelCents);
  charge("Parts", invoice.totals.partsCents); charge("Materials", invoice.totals.materialsCents); charge("Consumables", invoice.totals.consumablesCents);
  charge("TOTAL SERVICE VALUE", invoice.totals.serviceValueCents);
  charge("Manufacturer reimbursement (separate from customer due)", invoice.sheet.manufacturerReimbursementCents);
  paragraph("WARRANTY SERVICE - CUSTOMER DUE $0.00", bold, 13, green);
  paragraph("Covered warranty work carries no customer labor, travel, parts, material or consumable charge. Service value and manufacturer reimbursement remain separate accounting records.", regular, 9, muted);
  const pages = pdf.getPages();
  pages.forEach((item, index) => item.drawText(`${job.case_number}  |  Final warranty report  |  Page ${index + 1} of ${pages.length}`, { x: margin, y: 32, size: 9, font: regular, color: muted }));
  return pdf.save({ useObjectStreams: false });
}
