CREATE SCHEMA IF NOT EXISTS "drydock_p2p";
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "drydock_p2p"."po_status" AS ENUM('draft', 'pending_approval', 'approved', 'dispatched', 'received', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "drydock_p2p"."requisition_status" AS ENUM('draft', 'pending_approval', 'approved', 'rejected', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE "drydock_p2p"."goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"receipt_number" text NOT NULL,
	"po_id" uuid NOT NULL,
	"received_by" uuid NOT NULL,
	"receipt_date" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_p2p"."po_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"amount" integer NOT NULL,
	"account_id" uuid,
	"received_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_p2p"."purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_number" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"requisition_id" uuid,
	"status" "drydock_p2p"."po_status" DEFAULT 'draft' NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"order_date" timestamp with time zone NOT NULL,
	"expected_delivery" timestamp with time zone,
	"notes" text,
	"payment_terms_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_p2p"."purchase_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requisition_number" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"department_id" uuid,
	"status" "drydock_p2p"."requisition_status" DEFAULT 'draft' NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"needed_by" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_p2p"."receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"po_line_id" uuid NOT NULL,
	"quantity_received" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_p2p"."requisition_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"estimated_unit_price" integer NOT NULL,
	"estimated_amount" integer NOT NULL,
	"account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drydock_p2p"."goods_receipts" ADD CONSTRAINT "goods_receipts_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "drydock_p2p"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_p2p"."po_lines" ADD CONSTRAINT "po_lines_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "drydock_p2p"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_p2p"."purchase_orders" ADD CONSTRAINT "purchase_orders_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "drydock_p2p"."purchase_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_p2p"."receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "drydock_p2p"."goods_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_p2p"."receipt_lines" ADD CONSTRAINT "receipt_lines_po_line_id_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "drydock_p2p"."po_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_p2p"."requisition_lines" ADD CONSTRAINT "requisition_lines_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "drydock_p2p"."purchase_requisitions"("id") ON DELETE no action ON UPDATE no action;