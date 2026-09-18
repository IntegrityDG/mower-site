import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { SITE_CONTACT } from "@/lib/site-contact";
import { formatUsd } from "./domain";
import { customInvoicePdfModel } from "./pdf-model";
export { customInvoicePdfModel } from "./pdf-model";

type Detail = { invoice: Record<string, unknown>; items: Record<string, unknown>[] };
const PAGE = { width: 612, height: 792, margin: 48 };

function safeText(value: unknown) {
  return String(value ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2022]/g, "|")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\r\n\t]/g, "?");
}

function splitToken(token: string, width: number, font: PDFFont, size: number) {
  const pieces: string[] = [];
  let current = "";
  for (const character of token) {
    const candidate = current + character;
    if (current && font.widthOfTextAtSize(candidate, size) > width) { pieces.push(current); current = character; }
    else current = candidate;
  }
  if (current) pieces.push(current);
  return pieces;
}

function wrap(value: unknown, width: number, font: PDFFont, size: number) {
  const result: string[] = [];
  for (const paragraph of safeText(value).split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean).flatMap((word) => font.widthOfTextAtSize(word, size) <= width ? [word] : splitToken(word, width, font, size));
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
      else { if (line) result.push(line); line = word; }
    }
    result.push(line || " ");
  }
  return result;
}

export async function renderCustomInvoicePdf(detail: Detail) {
  const model = customInvoicePdfModel(detail);
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const invoiceNumber = safeText(model.invoiceNumber);
  const finalizedAt = new Date(String(detail.invoice.finalized_at));
  document.setTitle(`IDS Invoice ${invoiceNumber}`);
  document.setAuthor("Integrity Distribution Systems");
  document.setCreator("Integrity Distribution Systems");
  document.setProducer("Integrity Distribution Systems");
  document.setCreationDate(finalizedAt);
  document.setModificationDate(finalizedAt);

  let page: PDFPage = document.addPage([PAGE.width, PAGE.height]);
  let y = 0;
  const addPage = () => {
    if (y !== 0) page = document.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - PAGE.margin;
    page.drawText("INTEGRITY DISTRIBUTION SYSTEMS", { x: PAGE.margin, y, size: 13, font: bold, color: rgb(0.02, .42, .30) });
    page.drawText(safeText(SITE_CONTACT.email.display), { x: PAGE.margin, y: y - 17, size: 9, font: regular, color: rgb(.3,.34,.4) });
    page.drawText("INVOICE", { x: 470, y: y - 2, size: 22, font: bold, color: rgb(.08,.12,.2) });
    y -= 54;
  };
  const ensure = (height: number) => { if (y - height < PAGE.margin) addPage(); };
  const drawRight = (value: unknown, right: number, atY: number, size: number, font: PDFFont) => {
    const rendered = safeText(value);
    page.drawText(rendered, { x: right - font.widthOfTextAtSize(rendered, size), y: atY, size, font, color: rgb(.08,.12,.2) });
  };
  const drawLines = (lines: string[], x: number, width: number, size = 10, lineHeight = 14, font = regular) => {
    for (const source of lines) for (const line of wrap(source, width, font, size)) {
      ensure(lineHeight);
      page.drawText(line, { x, y, size, font, color: rgb(.08,.12,.2) });
      y -= lineHeight;
    }
  };

  addPage();
  page.drawText(invoiceNumber, { x: PAGE.margin, y, size: 17, font: bold });
  page.drawText(`Issue: ${safeText(model.issueDate)}`, { x: 390, y, size: 9, font: regular });
  y -= 16;
  page.drawText(`Due: ${safeText(model.dueDate)}`, { x: 390, y, size: 9, font: regular });
  page.drawText(`Status: ${safeText(model.status)}`, { x: PAGE.margin, y, size: 9, font: bold });
  y -= 30;

  const left = [...model.customer, ...model.billing].flatMap((line) => wrap(line, 225, regular, 10));
  const right = [...model.customer, ...model.shipping].flatMap((line) => wrap(line, 225, regular, 10));
  ensure(36 + Math.max(left.length, right.length) * 14);
  page.drawText("BILL TO", { x: PAGE.margin, y, size: 9, font: bold, color: rgb(.02,.42,.30) });
  page.drawText("SHIP TO", { x: 315, y, size: 9, font: bold, color: rgb(.02,.42,.30) });
  y -= 16;
  left.forEach((line, index) => page.drawText(line, { x: PAGE.margin, y: y - index * 14, size: 10, font: index === 0 ? bold : regular }));
  right.forEach((line, index) => page.drawText(line, { x: 315, y: y - index * 14, size: 10, font: index === 0 ? bold : regular }));
  y -= Math.max(left.length, right.length) * 14 + 18;

  const header = () => {
    page.drawRectangle({ x: PAGE.margin, y: y - 17, width: 516, height: 22, color: rgb(.93,.96,.95) });
    page.drawText("DESCRIPTION", { x: 54, y: y - 10, size: 8, font: bold });
    drawRight("QTY", 402, y - 10, 8, bold);
    drawRight("UNIT", 477, y - 10, 8, bold);
    drawRight("AMOUNT", 564, y - 10, 8, bold);
    y -= 30;
  };
  header();
  for (const item of model.items) {
    const description = `${item.description}${item.secondaryDescription ? ` - ${item.secondaryDescription}` : ""}`;
    const lines = wrap(description, 300, regular, 9);
    const height = Math.max(24, lines.length * 12 + 8);
    if (y - height < PAGE.margin + 150) { addPage(); header(); }
    lines.forEach((line, index) => page.drawText(line, { x: 54, y: y - index * 12, size: 9, font: regular }));
    drawRight(item.quantity, 402, y, 9, regular);
    drawRight(formatUsd(item.unitPriceCents), 477, y, 9, regular);
    const signed = item.lineType === "discount" || item.lineType === "credit" ? `-${formatUsd(item.lineAmountCents)}` : formatUsd(item.lineAmountCents);
    drawRight(signed, 564, y, 9, regular);
    y -= height;
  }

  ensure(190);
  y -= 8;
  const totals = [["Subtotal",model.subtotalCents],["Fees",model.feeCents],["Discounts",-model.discountCents],["Credits",-model.creditCents],["Sales Tax",model.taxCents],["TOTAL",model.totalCents],["Amount Paid",-model.paidCents],["BALANCE DUE",model.balanceCents]] as const;
  for (const [label, amount] of totals) {
    if (!amount && !["Subtotal","TOTAL","BALANCE DUE"].includes(label)) continue;
    const strong = label === "TOTAL" || label === "BALANCE DUE";
    const font = strong ? bold : regular;
    const size = strong ? 11 : 9;
    page.drawText(label, { x: 378, y, size, font });
    drawRight(`${amount < 0 ? "-" : ""}${formatUsd(Math.abs(amount))}`, 564, y, size, font);
    y -= strong ? 18 : 14;
  }
  for (const [heading, value] of [["CUSTOMER NOTES / TERMS",model.customerNotes],["FULFILLMENT",model.fulfillmentNotes]] as const) if (value) {
    ensure(55);
    y -= 12;
    page.drawText(heading, { x: PAGE.margin, y, size: 9, font: bold, color: rgb(.02,.42,.30) });
    y -= 16;
    drawLines([value], PAGE.margin, 500, 9, 13);
  }
  const pages = document.getPages();
  pages.forEach((item, index) => item.drawText(`IDS Invoice ${invoiceNumber} | Page ${index + 1} of ${pages.length}`, { x: PAGE.margin, y: 25, size: 8, font: regular, color: rgb(.4,.45,.5) }));
  return document.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 });
}
