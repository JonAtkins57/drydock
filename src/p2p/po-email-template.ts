// Pure function — no DB, no SES, no side effects. Safe to unit test without mocking.

export interface POEmailLine {
  description: string;
  quantity: number;
  unitPrice: number; // cents
}

export interface POEmailData {
  poNumber: string;
  vendorName: string;
  orderDate: string;
  expectedDelivery?: string | null;
  lines: POEmailLine[];
  totalAmount: number; // cents
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function renderPOEmailHtml(data: POEmailData): string {
  const lineRows = data.lines
    .map(
      (line) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">${line.description}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">${line.quantity}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${formatDollars(line.unitPrice)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${formatDollars(line.quantity * line.unitPrice)}</td>
      </tr>`,
    )
    .join('');

  const deliveryDisplay = data.expectedDelivery ?? '-';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Purchase Order ${data.poNumber}</title>
</head>
<body style="margin: 0; padding: 0; background: #f0f4f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width: 680px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
    <!-- Header -->
    <div style="background: #1a3a4a; padding: 32px 40px;">
      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">Purchase Order</h1>
      <p style="margin: 6px 0 0; color: #90cdf4; font-size: 14px; letter-spacing: 1px;">${data.poNumber}</p>
    </div>

    <!-- Meta -->
    <div style="padding: 28px 40px; border-bottom: 1px solid #e2e8f0; background: #f8fafb;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: #718096; font-size: 13px; width: 160px;">Vendor</td>
          <td style="padding: 4px 0; color: #1a202c; font-size: 13px; font-weight: 500;">${data.vendorName}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #718096; font-size: 13px;">Order Date</td>
          <td style="padding: 4px 0; color: #1a202c; font-size: 13px;">${data.orderDate}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #718096; font-size: 13px;">Expected Delivery</td>
          <td style="padding: 4px 0; color: #1a202c; font-size: 13px;">${deliveryDisplay}</td>
        </tr>
      </table>
    </div>

    <!-- Line Items -->
    <div style="padding: 28px 40px;">
      <h2 style="margin: 0 0 16px; color: #1a3a4a; font-size: 15px;">Line Items</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #edf2f7;">
            <th style="padding: 10px 12px; text-align: left; color: #4a5568; font-weight: 600;">Description</th>
            <th style="padding: 10px 12px; text-align: center; color: #4a5568; font-weight: 600;">Qty</th>
            <th style="padding: 10px 12px; text-align: right; color: #4a5568; font-weight: 600;">Unit Price</th>
            <th style="padding: 10px 12px; text-align: right; color: #4a5568; font-weight: 600;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding: 12px 12px; text-align: right; font-weight: 600; color: #1a202c;">Total</td>
            <td style="padding: 12px 12px; text-align: right; font-weight: 700; color: #1a3a4a; font-size: 15px;">${formatDollars(data.totalAmount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Footer -->
    <div style="padding: 20px 40px; background: #f8fafb; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="margin: 0; color: #a0aec0; font-size: 12px;">This purchase order was sent via DryDock — Thrasoz Operational Platform</p>
    </div>
  </div>
</body>
</html>`;
}
