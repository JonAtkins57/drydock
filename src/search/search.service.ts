import { pool } from '../db/connection.js';
import { ok, err } from '../lib/result.js';
import type { Result, AppError } from '../lib/result.js';

export type SearchType = 'customer' | 'vendor' | 'ap_invoice' | 'quote' | 'sales_order' | 'invoice' | 'lead';

export interface SearchResult {
  id: string;
  type: SearchType;
  label: string;
  sublabel: string | null;
  score: number;
  url: string;
}

interface SearchRow {
  id: string;
  type: string;
  label: string;
  sublabel: string | null;
  score: number;
}

// Each sub-query uses $1=tenantId, $2=tsquery string, $3=raw query for trigram similarity
const SOURCE_SQLS: Record<SearchType, string> = {
  customer: `
    SELECT id, 'customer' AS type, name AS label, customer_number AS sublabel,
      ts_rank(search_vector, plainto_tsquery('english', $2)) AS score
    FROM drydock_master.customers
    WHERE tenant_id = $1
      AND is_active = true
      AND (search_vector @@ plainto_tsquery('english', $2) OR similarity(name, $3) > 0.2)
  `,
  vendor: `
    SELECT id, 'vendor' AS type, name AS label, vendor_number AS sublabel,
      ts_rank(search_vector, plainto_tsquery('english', $2)) AS score
    FROM drydock_master.vendors
    WHERE tenant_id = $1
      AND is_active = true
      AND (search_vector @@ plainto_tsquery('english', $2) OR similarity(name, $3) > 0.2)
  `,
  ap_invoice: `
    SELECT id, 'ap_invoice' AS type, invoice_number AS label, source_email AS sublabel,
      ts_rank(search_vector, plainto_tsquery('english', $2)) AS score
    FROM drydock_ap.ap_invoices
    WHERE tenant_id = $1
      AND (search_vector @@ plainto_tsquery('english', $2) OR similarity(invoice_number, $3) > 0.2)
  `,
  quote: `
    SELECT id, 'quote' AS type, quote_number AS label, NULL::text AS sublabel,
      ts_rank(search_vector, plainto_tsquery('english', $2)) AS score
    FROM drydock_q2c.quotes
    WHERE tenant_id = $1
      AND (search_vector @@ plainto_tsquery('english', $2) OR similarity(quote_number, $3) > 0.2)
  `,
  sales_order: `
    SELECT id, 'sales_order' AS type, order_number AS label, NULL::text AS sublabel,
      ts_rank(search_vector, plainto_tsquery('english', $2)) AS score
    FROM drydock_q2c.sales_orders
    WHERE tenant_id = $1
      AND (search_vector @@ plainto_tsquery('english', $2) OR similarity(order_number, $3) > 0.2)
  `,
  invoice: `
    SELECT id, 'invoice' AS type, invoice_number AS label, NULL::text AS sublabel,
      ts_rank(search_vector, plainto_tsquery('english', $2)) AS score
    FROM drydock_q2c.invoices
    WHERE tenant_id = $1
      AND (search_vector @@ plainto_tsquery('english', $2) OR similarity(invoice_number, $3) > 0.2)
  `,
  lead: `
    SELECT id, 'lead' AS type, company_name AS label, email AS sublabel,
      ts_rank(search_vector, plainto_tsquery('english', $2)) AS score
    FROM drydock_crm.leads
    WHERE tenant_id = $1
      AND (search_vector @@ plainto_tsquery('english', $2) OR similarity(company_name, $3) > 0.2)
  `,
};

const URL_MAP: Record<SearchType, (id: string) => string> = {
  customer: (id) => `/customers/${id}`,
  vendor: (id) => `/vendors/${id}`,
  ap_invoice: (id) => `/ap/invoices/${id}`,
  quote: (id) => `/quotes/${id}`,
  sales_order: (id) => `/orders/${id}`,
  invoice: (id) => `/invoices/${id}`,
  lead: (id) => `/crm/leads/${id}`,
};

export async function globalSearch(
  tenantId: string,
  query: string,
  types: SearchType[],
): Promise<Result<SearchResult[], AppError>> {
  const trimmed = query.trim().slice(0, 200);
  if (!trimmed) return ok([]);

  const activeTypes = types.filter((t) => t in SOURCE_SQLS);
  if (activeTypes.length === 0) return ok([]);

  const unionSql = activeTypes.map((t) => SOURCE_SQLS[t]).join(' UNION ALL ');
  const finalSql = `
    SELECT * FROM (${unionSql}) combined
    ORDER BY score DESC
    LIMIT 20
  `;

  try {
    // Use pool directly for a connection-level SET + parameterized query
    const client = await pool.connect();
    try {
      await client.query(`SET app.current_tenant = $1`, [tenantId]);
      const result = await client.query<SearchRow>(finalSql, [tenantId, trimmed, trimmed]);
      const rows: SearchResult[] = result.rows.map((r) => ({
        id: r.id,
        type: r.type as SearchType,
        label: r.label,
        sublabel: r.sublabel ?? null,
        score: r.score,
        url: URL_MAP[r.type as SearchType]?.(r.id) ?? '/',
      }));
      return ok(rows);
    } finally {
      await client.query('RESET app.current_tenant');
      client.release();
    }
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Search failed', details: { error: e } });
  }
}
