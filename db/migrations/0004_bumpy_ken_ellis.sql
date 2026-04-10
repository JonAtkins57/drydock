CREATE SCHEMA IF NOT EXISTS "drydock_ap";
--> statement-breakpoint
CREATE TABLE "drydock_ap"."ap_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ap_invoice_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"amount" integer NOT NULL,
	"account_id" uuid,
	"department_id" uuid,
	"project_id" uuid,
	"cost_center_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_ap"."ap_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"po_id" uuid,
	"status" text DEFAULT 'intake' NOT NULL,
	"invoice_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"total_amount" integer,
	"subtotal" integer,
	"tax_amount" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"source" text NOT NULL,
	"source_email" text,
	"attachment_url" text,
	"attachment_hash" text,
	"ocr_confidence" numeric(5, 4),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_ap"."coding_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vendor_id" uuid,
	"description_pattern" text,
	"default_account_id" uuid NOT NULL,
	"department_id" uuid,
	"default_project_id" uuid,
	"default_cost_center_id" uuid,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_ap"."ocr_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ap_invoice_id" uuid NOT NULL,
	"extracted_vendor" text,
	"extracted_invoice_number" text,
	"extracted_date" text,
	"extracted_due_date" text,
	"extracted_total" text,
	"extracted_subtotal" text,
	"extracted_tax" text,
	"extracted_po_number" text,
	"extracted_line_items" jsonb,
	"field_confidences" jsonb,
	"raw_response" jsonb,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_ap"."po_match_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ap_invoice_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"match_type" text NOT NULL,
	"match_status" text NOT NULL,
	"price_variance" integer DEFAULT 0 NOT NULL,
	"quantity_variance" integer DEFAULT 0 NOT NULL,
	"tolerance_percent" numeric(5, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drydock_ap"."ap_invoice_lines" ADD CONSTRAINT "ap_invoice_lines_ap_invoice_id_ap_invoices_id_fk" FOREIGN KEY ("ap_invoice_id") REFERENCES "drydock_ap"."ap_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_ap"."ap_invoice_lines" ADD CONSTRAINT "ap_invoice_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "drydock_gl"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_ap"."ap_invoice_lines" ADD CONSTRAINT "ap_invoice_lines_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "drydock_master"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_ap"."ap_invoice_lines" ADD CONSTRAINT "ap_invoice_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "drydock_master"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_ap"."ap_invoice_lines" ADD CONSTRAINT "ap_invoice_lines_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "drydock_master"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_ap"."ap_invoices" ADD CONSTRAINT "ap_invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "drydock_master"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_ap"."coding_rules" ADD CONSTRAINT "coding_rules_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "drydock_master"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_ap"."coding_rules" ADD CONSTRAINT "coding_rules_default_account_id_accounts_id_fk" FOREIGN KEY ("default_account_id") REFERENCES "drydock_gl"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_ap"."coding_rules" ADD CONSTRAINT "coding_rules_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "drydock_master"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_ap"."coding_rules" ADD CONSTRAINT "coding_rules_default_project_id_projects_id_fk" FOREIGN KEY ("default_project_id") REFERENCES "drydock_master"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_ap"."coding_rules" ADD CONSTRAINT "coding_rules_default_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("default_cost_center_id") REFERENCES "drydock_master"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_ap"."ocr_results" ADD CONSTRAINT "ocr_results_ap_invoice_id_ap_invoices_id_fk" FOREIGN KEY ("ap_invoice_id") REFERENCES "drydock_ap"."ap_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_ap"."po_match_results" ADD CONSTRAINT "po_match_results_ap_invoice_id_ap_invoices_id_fk" FOREIGN KEY ("ap_invoice_id") REFERENCES "drydock_ap"."ap_invoices"("id") ON DELETE no action ON UPDATE no action;