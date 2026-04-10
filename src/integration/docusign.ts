import { createHmac } from 'crypto';

// ── Types ──────────────────────────────────────────────────────────

export interface DocuSignConfig {
  accountId: string;
  baseUrl: string;
  accessToken: string;
}

export interface EnvelopeSigner {
  name: string;
  email: string;
  recipientId?: string;
}

export interface SendEnvelopeOptions {
  subject: string;
  signers: EnvelopeSigner[];
  documentBase64: string;
  documentName: string;
  fileExtension?: string;
  documentId?: string;
}

export interface EnvelopeResult {
  envelopeId: string;
  status: string;
  statusDateTime: string;
  uri: string;
}

export class DocuSignApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public responseBody?: unknown,
  ) {
    super(message);
    this.name = 'DocuSignApiError';
  }
}

// ── HMAC Validation ───────────────────────────────────────────────

/**
 * Validates a DocuSign Connect HMAC-SHA256 webhook signature.
 * DocuSign sends X-DocuSign-Signature-1 header with a base64-encoded
 * HMAC-SHA256 of the raw request body.
 */
export function validateDocuSignHmac(rawBody: Buffer, signature: string, hmacKey: string): boolean {
  const computed = createHmac('sha256', hmacKey).update(rawBody).digest('base64');
  // Constant-time compare to prevent timing attacks
  if (computed.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── Send Envelope ─────────────────────────────────────────────────

/**
 * Creates and sends a DocuSign envelope for e-signature.
 * Uses the DocuSign eSignature REST API v2.1.
 */
export async function sendEnvelope(
  config: DocuSignConfig,
  options: SendEnvelopeOptions,
): Promise<EnvelopeResult> {
  const url = `${config.baseUrl}/accounts/${config.accountId}/envelopes`;

  const body = {
    emailSubject: options.subject,
    documents: [
      {
        documentBase64: options.documentBase64,
        name: options.documentName,
        fileExtension: options.fileExtension ?? 'txt',
        documentId: options.documentId ?? '1',
      },
    ],
    recipients: {
      signers: options.signers.map((s, idx) => ({
        name: s.name,
        email: s.email,
        recipientId: s.recipientId ?? String(idx + 1),
        routingOrder: String(idx + 1),
        tabs: {
          signHereTabs: [
            {
              documentId: options.documentId ?? '1',
              pageNumber: '1',
              xPosition: '100',
              yPosition: '700',
            },
          ],
        },
      })),
    },
    status: 'sent',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new DocuSignApiError(
      res.status,
      `DocuSign API error ${res.status}: ${res.statusText}`,
      errorBody,
    );
  }

  return res.json() as Promise<EnvelopeResult>;
}

// ── Get Envelope Status ───────────────────────────────────────────

export async function getEnvelopeStatus(
  config: DocuSignConfig,
  envelopeId: string,
): Promise<{ envelopeId: string; status: string; statusChangedDateTime: string }> {
  const url = `${config.baseUrl}/accounts/${config.accountId}/envelopes/${envelopeId}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new DocuSignApiError(
      res.status,
      `DocuSign API error ${res.status}: ${res.statusText}`,
      errorBody,
    );
  }

  return res.json() as Promise<{ envelopeId: string; status: string; statusChangedDateTime: string }>;
}

// ── Config Loader ─────────────────────────────────────────────────

export function getDocuSignConfig(): DocuSignConfig | null {
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  const baseUrl = process.env.DOCUSIGN_BASE_URL;
  const accessToken = process.env.DOCUSIGN_ACCESS_TOKEN;

  if (!accountId || !baseUrl || !accessToken) return null;

  return { accountId, baseUrl, accessToken };
}
