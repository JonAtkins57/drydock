CREATE SCHEMA IF NOT EXISTS "drydock_q2c";
--> statement-breakpoint
CREATE TYPE "drydock_q2c"."billing_method" AS ENUM('advance', 'arrears');--> statement-breakpoint
CREATE TYPE "drydock_q2c"."billing_plan_status" AS ENUM('active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "drydock_q2c"."frequency" AS ENUM('monthly', 'quarterly', 'annual', 'one_time');--> statement-breakpoint
CREATE TYPE "drydock_q2c"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled', 'credited');--> statement-breakpoint
CREATE TYPE "drydock_q2c"."order_status" AS ENUM('draft', 'confirmed', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "drydock_q2c"."plan_type" AS ENUM('fixed', 'recurring', 'milestone');--> statement-breakpoint
CREATE TYPE "drydock_q2c"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "drydock_q2c"."schedule_line_status" AS ENUM('scheduled', 'invoiced', 'cancelled');--> statement-breakpoint
CREATE TABLE "drydock_q2c"."billing_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"plan_type" "drydock_q2c"."plan_type" NOT NULL,
	"billing_method" "drydock_q2c"."billing_method" NOT NULL,
	"frequency" "drydock_q2c"."frequency" NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"status" "drydock_q2c"."billing_plan_status" DEFAULT 'active' NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_q2c"."billing_schedule_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"billing_plan_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"billing_date" timestamp with time zone NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"amount" integer NOT NULL,
	"status" "drydock_q2c"."schedule_line_status" DEFAULT 'scheduled' NOT NULL,
	"invoice_id" uuid,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_q2c"."invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"amount" integer NOT NULL,
	"account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_q2c"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_id" uuid,
	"status" "drydock_q2c"."invoice_status" DEFAULT 'draft' NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"invoice_date" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_date" timestamp with time zone,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_q2c"."order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_q2c"."quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"amount" integer NOT NULL,
	"account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_q2c"."quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quote_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "drydock_q2c"."quote_status" DEFAULT 'draft' NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"valid_until" timestamp with time zone,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_quote_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_q2c"."sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"quote_id" uuid,
	"status" "drydock_q2c"."order_status" DEFAULT 'draft' NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"order_date" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "drydock_q2c"."billing_schedule_lines" ADD CONSTRAINT "billing_schedule_lines_billing_plan_id_billing_plans_id_fk" FOREIGN KEY ("billing_plan_id") REFERENCES "drydock_q2c"."billing_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_q2c"."invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "drydock_q2c"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_q2c"."order_lines" ADD CONSTRAINT "order_lines_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "drydock_q2c"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_q2c"."quote_lines" ADD CONSTRAINT "quote_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "drydock_q2c"."quotes"("id") ON DELETE no action ON UPDATE no action;