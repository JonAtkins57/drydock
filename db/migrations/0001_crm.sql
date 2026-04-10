CREATE SCHEMA IF NOT EXISTS "drydock_crm";
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "drydock_crm"."activity_type" AS ENUM('task', 'note', 'meeting', 'call', 'email'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "drydock_crm"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'converted', 'lost'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "drydock_crm"."opportunity_stage" AS ENUM('prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE "drydock_crm"."activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"activity_type" "drydock_crm"."activity_type" NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"assigned_to" uuid,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"is_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_crm"."leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"source" text,
	"status" "drydock_crm"."lead_status" DEFAULT 'new' NOT NULL,
	"assigned_to" uuid,
	"converted_opportunity_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_crm"."opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"customer_id" uuid,
	"lead_id" uuid,
	"stage" "drydock_crm"."opportunity_stage" DEFAULT 'prospecting' NOT NULL,
	"probability" integer DEFAULT 0 NOT NULL,
	"expected_amount" integer DEFAULT 0 NOT NULL,
	"expected_close_date" timestamp with time zone,
	"assigned_to" uuid,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "drydock_crm"."opportunities" ADD CONSTRAINT "opportunities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "drydock_master"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_crm"."opportunities" ADD CONSTRAINT "opportunities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "drydock_crm"."leads"("id") ON DELETE no action ON UPDATE no action;