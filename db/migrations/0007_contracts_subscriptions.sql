DO $$ BEGIN CREATE TYPE "drydock_crm"."contract_status" AS ENUM('draft', 'executed', 'active', 'expired', 'terminated'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "drydock_crm"."subscription_billing_cycle" AS ENUM('monthly', 'quarterly', 'annual', 'one_time'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "drydock_crm"."subscription_status" AS ENUM('active', 'paused', 'cancelled', 'expired'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drydock_crm"."contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contract_number" text NOT NULL,
	"name" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"status" "drydock_crm"."contract_status" DEFAULT 'draft' NOT NULL,
	"effective_date" timestamp with time zone NOT NULL,
	"expiration_date" timestamp with time zone,
	"total_value" integer,
	"terms" text,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"renewal_notice_days" integer,
	"billing_plan_id" uuid,
	"assigned_to" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drydock_crm"."contract_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"amount" integer NOT NULL,
	"delivery_terms" text,
	"item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drydock_crm"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contract_id" uuid,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"plan" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"billing_cycle" "drydock_crm"."subscription_billing_cycle" NOT NULL,
	"status" "drydock_crm"."subscription_status" DEFAULT 'active' NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"billing_plan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "drydock_crm"."contract_lines" ADD CONSTRAINT "contract_lines_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "drydock_crm"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_crm"."contracts" ADD CONSTRAINT "contracts_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "drydock_crm"."opportunities"("id") ON DELETE no action ON UPDATE no action;
