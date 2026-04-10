import { describe, it, expect } from 'vitest';
import { renderPOEmailHtml, type POEmailData } from '../../src/p2p/po-email-template.js';

const baseData: POEmailData = {
  poNumber: 'PO-0042',
  vendorName: 'Acme Supplies',
  orderDate: '2026-04-10',
  expectedDelivery: '2026-04-20',
  lines: [
    { description: 'Widget A', quantity: 2, unitPrice: 1500 },
    { description: 'Gadget B', quantity: 5, unitPrice: 800 },
  ],
  totalAmount: 7000,
};

describe('renderPOEmailHtml', () => {
  it('renders line item table with description, quantity, and unit price columns', () => {
    const html = renderPOEmailHtml(baseData);
    expect(html).toContain('Widget A');
    expect(html).toContain('Gadget B');
    // quantity values
    expect(html).toContain('>2<');
    expect(html).toContain('>5<');
    // unit price columns
    expect(html).toContain('$15.00');
    expect(html).toContain('$8.00');
  });

  it('formats dollar amounts correctly from integer cents', () => {
    const html = renderPOEmailHtml({
      ...baseData,
      lines: [{ description: 'Test Item', quantity: 1, unitPrice: 99999 }],
      totalAmount: 99999,
    });
    // $999.99
    expect(html).toContain('$999.99');
    // total
    expect(html).toContain('$999.99');
  });

  it('renders missing expectedDelivery as "-"', () => {
    const html = renderPOEmailHtml({ ...baseData, expectedDelivery: null });
    expect(html).toContain('>-<');
  });

  it('includes po_number and vendor_name in the HTML structure', () => {
    const html = renderPOEmailHtml(baseData);
    expect(html).toContain('PO-0042');
    expect(html).toContain('Acme Supplies');
  });
});
