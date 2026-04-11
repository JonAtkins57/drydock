import puppeteer from 'puppeteer';
import { eq, and } from 'drizzle-orm';
import { quoteService } from './quotes.service.js';
import { invoiceService } from './invoices.service.js';
import { getPO } from '../p2p/purchase-orders.service.js';
import { db } from '../db/connection.js';
import { customers, vendors } from '../db/schema/index.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';

// ── Helpers ────────────────────────────────────────────────────────

function cents(amount: number): string {
  return '$' + (amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BASE_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a202c; margin: 0; padding: 40px; }
  h1 { color: #1a3a4a; font-size: 24px; margin-bottom: 4px; }
  .meta { color: #4a5568; font-size: 14px; margin-bottom: 6px; }
  .label { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 13px; }
  th { background: #f7fafc; text-align: left; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; }
  td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
  td.num { text-align: right; }
  .totals { margin-top: 16px; text-align: right; font-size: 14px; }
  .totals div { margin-bottom: 4px; }
  .totals .grand { font-size: 16px; font-weight: 700; color: #1a3a4a; }
  .footer { margin-top: 40px; font-size: 11px; color: #718096; }
`;

// ── Generate Quote PDF ─────────────────────────────────────────────

export async function generateQuotePdf(
  tenantId: string,
  id: string,
): Promise<Result<Buffer, AppError>> {
  const quoteResult = await quoteService.getQuote(tenantId, id);
  if (!quoteResult.ok) return quoteResult;
  const quote = quoteResult.value;

  const customerRows = await db
    .select({ name: customers.name })
    .from(customers)
    .where(and(eq(customers.id, quote.customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  const customerName = customerRows[0]?.name ?? '';
  const validUntilStr = quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('en-US') : 'N/A';

  const lineRows = quote.lines
    .map(
      (l) =>
        `<tr>
          <td>${esc(l.description)}</td>
          <td class="num">${l.quantity}</td>
          <td class="num">${cents(l.unitPrice)}</td>
          <td class="num">${cents(l.amount)}</td>
        </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
<body>
  <h1>Quote ${esc(quote.quoteNumber)}</h1>
  <p class="meta"><span class="label">Customer:</span> ${esc(customerName)}</p>
  <p class="meta"><span class="label">Valid Until:</span> ${validUntilStr}</p>
  ${quote.notes ? `<p class="meta"><span class="label">Notes:</span> ${esc(quote.notes)}</p>` : ''}
  <table>
    <thead>
      <tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>
  <div class="totals">
    <div class="grand">Total: ${cents(quote.totalAmount)}</div>
  </div>
  <div class="footer">Thrasoz / DryDock Operational Platform</div>
</body>
</html>`;

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    return ok(Buffer.from(pdfBuffer));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err({ code: 'INTERNAL', message: 'Quote PDF generation failed', details: { error: message } });
  }
}

// ── Generate Invoice PDF ───────────────────────────────────────────

export async function generateInvoicePdf(
  tenantId: string,
  id: string,
): Promise<Result<Buffer, AppError>> {
  const invoiceResult = await invoiceService.getInvoice(tenantId, id);
  if (!invoiceResult.ok) return invoiceResult;
  const invoice = invoiceResult.value;

  const customerRows = await db
    .select({ name: customers.name })
    .from(customers)
    .where(and(eq(customers.id, invoice.customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  const customerName = customerRows[0]?.name ?? '';
  const invoiceDateStr = new Date(invoice.invoiceDate).toLocaleDateString('en-US');
  const dueDateStr = new Date(invoice.dueDate).toLocaleDateString('en-US');
  const subtotal = invoice.totalAmount - invoice.taxAmount;

  const lineRows = invoice.lines
    .map(
      (l) =>
        `<tr>
          <td>${esc(l.description)}</td>
          <td class="num">${l.quantity}</td>
          <td class="num">${cents(l.unitPrice)}</td>
          <td class="num">${cents(l.amount)}</td>
        </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
<body>
  <h1>Invoice ${esc(invoice.invoiceNumber)}</h1>
  <p class="meta"><span class="label">Customer:</span> ${esc(customerName)}</p>
  <p class="meta"><span class="label">Invoice Date:</span> ${invoiceDateStr}</p>
  <p class="meta"><span class="label">Due Date:</span> ${dueDateStr}</p>
  <table>
    <thead>
      <tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>
  <div class="totals">
    <div>Subtotal: ${cents(subtotal)}</div>
    <div>Tax: ${cents(invoice.taxAmount)}</div>
    <div>Paid: ${cents(invoice.paidAmount)}</div>
    <div class="grand">Total: ${cents(invoice.totalAmount)}</div>
  </div>
  <div class="footer">Thrasoz / DryDock Operational Platform</div>
</body>
</html>`;

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    return ok(Buffer.from(pdfBuffer));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err({ code: 'INTERNAL', message: 'Invoice PDF generation failed', details: { error: message } });
  }
}

// ── Generate PO PDF ────────────────────────────────────────────────

export async function generatePoPdf(
  tenantId: string,
  id: string,
): Promise<Result<Buffer, AppError>> {
  const poResult = await getPO(tenantId, id);
  if (!poResult.ok) return poResult;
  const po = poResult.value;

  const vendorRows = await db
    .select({ name: vendors.name })
    .from(vendors)
    .where(and(eq(vendors.id, po.vendorId), eq(vendors.tenantId, tenantId)))
    .limit(1);

  const vendorName = vendorRows[0]?.name ?? '';
  const orderDateStr = new Date(po.orderDate).toLocaleDateString('en-US');
  const expectedDateStr = po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString('en-US') : 'N/A';

  const lineRows = po.lines
    .map(
      (l) =>
        `<tr>
          <td>${esc(l.description)}</td>
          <td class="num">${l.quantity}</td>
          <td class="num">${cents(l.unitPrice)}</td>
          <td class="num">${cents(l.amount)}</td>
        </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
<body>
  <h1>Purchase Order ${esc(po.poNumber)}</h1>
  <p class="meta"><span class="label">Vendor:</span> ${esc(vendorName)}</p>
  <p class="meta"><span class="label">Order Date:</span> ${orderDateStr}</p>
  <p class="meta"><span class="label">Expected Delivery:</span> ${expectedDateStr}</p>
  ${po.notes ? `<p class="meta"><span class="label">Notes:</span> ${esc(po.notes)}</p>` : ''}
  <table>
    <thead>
      <tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>
  <div class="totals">
    <div class="grand">Total: ${cents(po.totalAmount)}</div>
  </div>
  <div class="footer">Thrasoz / DryDock Operational Platform</div>
</body>
</html>`;

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    return ok(Buffer.from(pdfBuffer));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err({ code: 'INTERNAL', message: 'PO PDF generation failed', details: { error: message } });
  }
}
