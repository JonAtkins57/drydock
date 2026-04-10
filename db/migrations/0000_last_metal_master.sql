CREATE SCHEMA IF NOT EXISTS "drydock_core";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "drydock_master";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "drydock_gl";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "drydock_audit";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "drydock_integration";
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "drydock_core"."data_type" AS ENUM('text', 'long_text', 'numeric', 'currency', 'date', 'datetime', 'boolean', 'single_select', 'multi_select', 'reference', 'formula', 'attachment_ref'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE "drydock_core"."approval_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workflow_instance_id" uuid NOT NULL,
	"approval_step_id" uuid NOT NULL,
	"approver_id" uuid NOT NULL,
	"decision" text,
	"comments" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_transition_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"approval_type" text DEFAULT 'serial' NOT NULL,
	"approver_rule" jsonb,
	"timeout_hours" integer,
	"escalation_rule" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"field_key" text NOT NULL,
	"display_name" text NOT NULL,
	"data_type" "drydock_core"."data_type" NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"default_source" jsonb,
	"validation_rules" jsonb,
	"field_group" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"help_text" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"security_config" jsonb,
	"gl_posting_behavior" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"value_text" text,
	"value_numeric" integer,
	"value_date" timestamp with time zone,
	"value_boolean" boolean,
	"value_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."custom_transaction_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transaction_type_id" uuid NOT NULL,
	"transaction_number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"header_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."custom_transaction_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transaction_instance_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"line_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."custom_transaction_type_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type_key" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"base_posting_model" jsonb,
	"status_workflow_id" uuid,
	"numbering_scheme" text,
	"permissions_config" jsonb,
	"document_template_id" uuid,
	"reporting_config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."numbering_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"prefix" text NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL,
	"pad_width" integer DEFAULT 6 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."picklist_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"list_key" text NOT NULL,
	"display_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."picklist_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"picklist_id" uuid NOT NULL,
	"value_key" text NOT NULL,
	"display_value" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system_role" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"settings" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"employee_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."workflow_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"current_state_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."workflow_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"state_key" text NOT NULL,
	"display_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_initial" boolean DEFAULT false NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"entry_actions" jsonb,
	"exit_actions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_core"."workflow_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"from_state_id" uuid NOT NULL,
	"to_state_id" uuid NOT NULL,
	"transition_key" text NOT NULL,
	"display_name" text NOT NULL,
	"conditions" jsonb,
	"required_permissions" text,
	"actions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_master"."contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"vendor_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"title" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_master"."cost_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"department_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_master"."currencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"decimal_places" integer DEFAULT 2 NOT NULL,
	CONSTRAINT "currencies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "drydock_master"."customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"customer_number" text NOT NULL,
	"entity_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"billing_address" jsonb,
	"shipping_address" jsonb,
	"payment_terms_id" uuid,
	"tax_code_id" uuid,
	"credit_limit" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"parent_customer_id" uuid,
	"external_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_master"."departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_id" uuid,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"parent_id" uuid,
	"manager_employee_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_master"."employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_number" text NOT NULL,
	"user_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"department_id" uuid,
	"manager_id" uuid,
	"hire_date" timestamp with time zone,
	"termination_date" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"bamboohr_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_master"."items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_number" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"item_type" text DEFAULT 'service' NOT NULL,
	"unit_of_measure" text,
	"revenue_account_id" uuid,
	"expense_account_id" uuid,
	"cogs_account_id" uuid,
	"standard_cost" integer,
	"list_price" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_master"."legal_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"address" jsonb,
	"tax_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_master"."locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_master"."payment_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"days_due" integer NOT NULL,
	"discount_days" integer,
	"discount_percent" numeric(5, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_master"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_number" text NOT NULL,
	"name" text NOT NULL,
	"customer_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"project_type" text,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"budget_amount" integer,
	"manager_employee_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_master"."tax_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"rate" numeric(7, 4) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_master"."vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vendor_number" text NOT NULL,
	"entity_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"remit_to_address" jsonb,
	"payment_terms_id" uuid,
	"tax_id" text,
	"default_expense_account_id" uuid,
	"currency" text DEFAULT 'USD' NOT NULL,
	"external_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_gl"."accounting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_id" uuid,
	"period_name" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"fiscal_year" integer NOT NULL,
	"period_number" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_gl"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_number" text NOT NULL,
	"name" text NOT NULL,
	"account_type" text NOT NULL,
	"account_subtype" text,
	"parent_account_id" uuid,
	"is_posting_account" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"normal_balance" text DEFAULT 'debit' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_gl"."journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_id" uuid,
	"journal_number" text NOT NULL,
	"journal_type" text DEFAULT 'manual' NOT NULL,
	"period_id" uuid NOT NULL,
	"posting_date" timestamp with time zone NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_module" text,
	"source_entity_type" text,
	"source_entity_id" uuid,
	"created_by" uuid,
	"approved_by" uuid,
	"posted_by" uuid,
	"posted_at" timestamp with time zone,
	"reversed_by_journal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_gl"."journal_entry_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"account_id" uuid NOT NULL,
	"debit_amount" bigint DEFAULT 0 NOT NULL,
	"credit_amount" bigint DEFAULT 0 NOT NULL,
	"description" text,
	"department_id" uuid,
	"location_id" uuid,
	"customer_id" uuid,
	"vendor_id" uuid,
	"project_id" uuid,
	"cost_center_id" uuid,
	"entity_id" uuid,
	"custom_dimensions" jsonb
);
--> statement-breakpoint
CREATE TABLE "drydock_audit"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"changes" jsonb,
	"ip_address" text,
	"session_id" text
);
--> statement-breakpoint
CREATE TABLE "drydock_integration"."external_key_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"integration_type" text NOT NULL,
	"external_system" text NOT NULL,
	"external_id" text NOT NULL,
	"internal_entity_type" text NOT NULL,
	"internal_entity_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_integration"."integration_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"integration_type" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb,
	"sync_schedule" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_integration"."integration_error_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_log_id" uuid NOT NULL,
	"source_record_id" text,
	"error_type" text NOT NULL,
	"error_message" text NOT NULL,
	"payload" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drydock_integration"."integration_field_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_config_id" uuid NOT NULL,
	"source_field" text NOT NULL,
	"target_entity" text NOT NULL,
	"target_field" text NOT NULL,
	"transform_rule" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drydock_integration"."integration_sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_config_id" uuid NOT NULL,
	"sync_type" text DEFAULT 'incremental' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"records_processed" integer DEFAULT 0 NOT NULL,
	"records_failed" integer DEFAULT 0 NOT NULL,
	"error_details" jsonb
);
--> statement-breakpoint
ALTER TABLE "drydock_core"."approval_records" ADD CONSTRAINT "approval_records_workflow_instance_id_workflow_instances_id_fk" FOREIGN KEY ("workflow_instance_id") REFERENCES "drydock_core"."workflow_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."approval_records" ADD CONSTRAINT "approval_records_approval_step_id_approval_steps_id_fk" FOREIGN KEY ("approval_step_id") REFERENCES "drydock_core"."approval_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."approval_steps" ADD CONSTRAINT "approval_steps_workflow_transition_id_workflow_transitions_id_fk" FOREIGN KEY ("workflow_transition_id") REFERENCES "drydock_core"."workflow_transitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."custom_field_values" ADD CONSTRAINT "custom_field_values_field_definition_id_custom_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "drydock_core"."custom_field_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."custom_transaction_instances" ADD CONSTRAINT "custom_transaction_instances_transaction_type_id_custom_transaction_type_definitions_id_fk" FOREIGN KEY ("transaction_type_id") REFERENCES "drydock_core"."custom_transaction_type_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."custom_transaction_lines" ADD CONSTRAINT "custom_transaction_lines_transaction_instance_id_custom_transaction_instances_id_fk" FOREIGN KEY ("transaction_instance_id") REFERENCES "drydock_core"."custom_transaction_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."picklist_values" ADD CONSTRAINT "picklist_values_picklist_id_picklist_definitions_id_fk" FOREIGN KEY ("picklist_id") REFERENCES "drydock_core"."picklist_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."roles" ADD CONSTRAINT "roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "drydock_core"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "drydock_core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "drydock_core"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "drydock_core"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."workflow_instances" ADD CONSTRAINT "workflow_instances_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "drydock_core"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."workflow_instances" ADD CONSTRAINT "workflow_instances_current_state_id_workflow_states_id_fk" FOREIGN KEY ("current_state_id") REFERENCES "drydock_core"."workflow_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."workflow_states" ADD CONSTRAINT "workflow_states_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "drydock_core"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."workflow_transitions" ADD CONSTRAINT "workflow_transitions_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "drydock_core"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."workflow_transitions" ADD CONSTRAINT "workflow_transitions_from_state_id_workflow_states_id_fk" FOREIGN KEY ("from_state_id") REFERENCES "drydock_core"."workflow_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_core"."workflow_transitions" ADD CONSTRAINT "workflow_transitions_to_state_id_workflow_states_id_fk" FOREIGN KEY ("to_state_id") REFERENCES "drydock_core"."workflow_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_master"."contacts" ADD CONSTRAINT "contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "drydock_master"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_master"."contacts" ADD CONSTRAINT "contacts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "drydock_master"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_master"."cost_centers" ADD CONSTRAINT "cost_centers_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "drydock_master"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_master"."customers" ADD CONSTRAINT "customers_entity_id_legal_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "drydock_master"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_master"."customers" ADD CONSTRAINT "customers_payment_terms_id_payment_terms_id_fk" FOREIGN KEY ("payment_terms_id") REFERENCES "drydock_master"."payment_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_master"."customers" ADD CONSTRAINT "customers_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "drydock_master"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_master"."departments" ADD CONSTRAINT "departments_entity_id_legal_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "drydock_master"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_master"."employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "drydock_master"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_master"."projects" ADD CONSTRAINT "projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "drydock_master"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_master"."projects" ADD CONSTRAINT "projects_manager_employee_id_employees_id_fk" FOREIGN KEY ("manager_employee_id") REFERENCES "drydock_master"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_master"."vendors" ADD CONSTRAINT "vendors_entity_id_legal_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "drydock_master"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_master"."vendors" ADD CONSTRAINT "vendors_payment_terms_id_payment_terms_id_fk" FOREIGN KEY ("payment_terms_id") REFERENCES "drydock_master"."payment_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_gl"."accounting_periods" ADD CONSTRAINT "accounting_periods_entity_id_legal_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "drydock_master"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_gl"."journal_entries" ADD CONSTRAINT "journal_entries_entity_id_legal_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "drydock_master"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_gl"."journal_entries" ADD CONSTRAINT "journal_entries_period_id_accounting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "drydock_gl"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_gl"."journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "drydock_gl"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_gl"."journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "drydock_gl"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_gl"."journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "drydock_master"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_gl"."journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "drydock_master"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_gl"."journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "drydock_master"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_gl"."journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "drydock_master"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_gl"."journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "drydock_master"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_gl"."journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "drydock_master"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_gl"."journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entity_id_legal_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "drydock_master"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_integration"."integration_error_queue" ADD CONSTRAINT "integration_error_queue_sync_log_id_integration_sync_logs_id_fk" FOREIGN KEY ("sync_log_id") REFERENCES "drydock_integration"."integration_sync_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_integration"."integration_field_mappings" ADD CONSTRAINT "integration_field_mappings_integration_config_id_integration_configs_id_fk" FOREIGN KEY ("integration_config_id") REFERENCES "drydock_integration"."integration_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drydock_integration"."integration_sync_logs" ADD CONSTRAINT "integration_sync_logs_integration_config_id_integration_configs_id_fk" FOREIGN KEY ("integration_config_id") REFERENCES "drydock_integration"."integration_configs"("id") ON DELETE no action ON UPDATE no action;