# DryDock TODO

## Phase 1 — COMPLETE ✅
All 26 Harbor tickets done. All 9 CLAUDE.md Phase 1 modules built with backend + frontend + tests.

## Phase 2 — COMPLETE ✅
All Phase 2 items shipped (DD-27 through DD-54). All 54 Harbor tickets in `done` state.

## Genuine Code Gaps — ALL RESOLVED ✅

- ✅ `queueOcrJob()` already called in `intake.service.ts:119` (was stale TODO)
- ✅ S3/Textract now per-tenant from `integration_configs` (type='aws'), global env as fallback — `workers.ts` 2026-04-12
- ✅ IMAP per-tenant from `integration_configs` (type='imap') — already wired, merge conflict resolved 2026-04-12

## Config / Ops (not code work)
- [ ] Set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` in prod .env for real S3/Textract
- [ ] Configure IMAP credentials per-tenant in integration_configs for real AP inbox polling
- [ ] Configure Redis URL for BullMQ workers to actually run in production

## Stale Items Cleared
- DocuSign ✅ (DD-38 merged, wired into quotes + webhook handler in server.ts)
- PDF generation ✅ (DD-39)
- Real S3 implementation ✅ (DD-51 — real client in s3.client.ts, factory wired; stub is fallback)
- Real Textract ✅ (DD — real client in ocr.worker.ts, uses AWS SDK; stubs only used if not configured)
- Real IMAP ✅ (DD — imapflow + mailparser wired in imap.poller.ts; stub is fallback)
- Concur integration ✅ (DD-40)
- All Phase 2 backlog items ✅ (expense amortization, revenue rec, fixed assets, inventory, project mgmt, etc.)
