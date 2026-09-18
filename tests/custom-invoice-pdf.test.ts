import assert from "node:assert/strict";
import test from "node:test";
import * as pdfLib from "pdf-lib";
import * as renderer from "../lib/custom-invoices/pdf";

const detail={invoice:{invoice_number:"IDS-INV-2026-00001",status:"partially_paid",finalized_at:"2026-09-17T12:00:00Z",due_date:"2027-01-15",customer_name:"Taylor Customer",company_name:"Customer Co",billing_address:{line1:"1 Main",city:"Cape",state:"MO",postalCode:"63701"},shipping_address:{line1:"1 Main",city:"Cape",state:"MO",postalCode:"63701"},subtotal_cents:460000,fee_cents:15000,discount_cents:40000,credit_cents:0,tax_cents:125,total_cents:435125,amount_paid_cents:150000,customer_notes:"Special event pricing.",fulfillment_notes:"Preorder fulfillment is subject to availability.",internal_notes:"private margin",id:"private-uuid",stripe_customer_id:"cus_secret"},items:[{description:"Y40P",secondary_description:"Negotiated package",quantity:1,unit_price_cents:460000,line_amount_cents:460000,line_type:"item"},{description:"Delivery",secondary_description:null,quantity:1,unit_price_cents:15000,line_amount_cents:15000,line_type:"fee"},{description:"Fair discount",secondary_description:null,quantity:1,unit_price_cents:40000,line_amount_cents:40000,line_type:"discount"}]};

test("custom invoice PDF produces a valid, titled, finalized-snapshot document",async()=>{
  const bytes=await renderer.renderCustomInvoicePdf(detail);assert.equal(Buffer.from(bytes).subarray(0,5).toString(),"%PDF-");const pdf=await pdfLib.PDFDocument.load(bytes);assert.equal(pdf.getTitle(),"IDS Invoice IDS-INV-2026-00001");assert.equal(pdf.getAuthor(),"Integrity Distribution Systems");assert.ok(pdf.getPageCount()>=1);
});

test("custom invoice PDF refuses drafts before rendering",async()=>{
  await assert.rejects(renderer.renderCustomInvoicePdf({invoice:{...detail.invoice,status:"draft",invoice_number:null},items:detail.items}),/Only finalized invoices/);
});

test("custom invoice PDF safely wraps long tokens and unsupported Unicode",async()=>{
  const long="Mower-"+"X".repeat(500)+" — café 🚜";const bytes=await renderer.renderCustomInvoicePdf({invoice:{...detail.invoice,customer_name:long,billing_address:{...detail.invoice.billing_address,line1:long}},items:[{...detail.items[0],description:long,secondary_description:long}]});const pdf=await pdfLib.PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>=1);
});
