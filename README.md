# DryDock

**Operational Platform — CRM / ERP / AP Portal / Financial Close / Planning**

![DryDock Logo](assets/drydock-logo.svg)

DryDock is a multi-tenant operational platform that unifies Quote-to-Cash, Procure-to-Pay, and Record-to-Report workflows with a built-in Accounts Payable portal featuring OCR, learned coding, approval workflows, and purchase order matching.

## Stack

- **Backend**: Node.js / TypeScript / Fastify
- **Database**: PostgreSQL 16+ with Row Level Security
- **ORM**: Drizzle
- **Frontend**: React / TypeScript / Vite / Tailwind
- **Queue**: BullMQ / Redis
- **OCR**: AWS Textract
- **Infrastructure**: AWS (RDS, ECS, S3, SQS, ElastiCache)

## Architecture

See [.claude/CLAUDE.md](.claude/CLAUDE.md) for the full system prompt and architecture specification.

## Status

**Phase 1 in progress** — metadata engine, tenant/auth, master data, GL, CRM, Q2C, P2P, AP portal, BambooHR integration.

## License

Proprietary — Thrasoz / Atkins Professional Services
