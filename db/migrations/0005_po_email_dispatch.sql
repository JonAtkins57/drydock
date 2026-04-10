ALTER TYPE "drydock_p2p"."po_status" ADD VALUE IF NOT EXISTS 'sent';
--> statement-breakpoint
CREATE TABLE "drydock_p2p"."email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"ses_message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_by" uuid
);
--> statement-breakpoint
ALTER TABLE "drydock_p2p"."email_log" ADD CONSTRAINT "email_log_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "drydock_p2p"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
