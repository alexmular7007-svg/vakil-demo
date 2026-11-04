CREATE TABLE "app"."clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'individual' NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"gstin" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."fee_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"invoice_id" uuid,
	"client_id" uuid,
	"amount_paise" bigint NOT NULL,
	"received_on" date NOT NULL,
	"mode" text DEFAULT 'upi' NOT NULL,
	"reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."hearings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"matter_id" uuid,
	"case_title" text NOT NULL,
	"court" text,
	"bench" text,
	"case_no" text,
	"cnr" text,
	"hearing_date" date NOT NULL,
	"hearing_time" text,
	"item_no" text,
	"purpose" text,
	"notes" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"outcome" text,
	"next_hearing_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"client_id" uuid,
	"matter_id" uuid,
	"number" text NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date,
	"bill_to" jsonb NOT NULL,
	"items" jsonb NOT NULL,
	"subtotal_paise" bigint NOT NULL,
	"gst_mode" text DEFAULT 'none' NOT NULL,
	"gst_rate_bp" integer DEFAULT 0 NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_ownerId_number_unique" UNIQUE("owner_id","number")
);
--> statement-breakpoint
CREATE TABLE "app"."practice_profiles" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"address" text,
	"phone" text,
	"email" text,
	"gstin" text,
	"upi_id" text,
	"invoice_prefix" text DEFAULT 'INV' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"matter_id" uuid,
	"title" text NOT NULL,
	"due_date" date,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."matters" ADD COLUMN "cnr" text;--> statement-breakpoint
ALTER TABLE "app"."matters" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."matters" ADD COLUMN "opposing_party" text;--> statement-breakpoint
ALTER TABLE "app"."clients" ADD CONSTRAINT "clients_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fee_receipts" ADD CONSTRAINT "fee_receipts_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fee_receipts" ADD CONSTRAINT "fee_receipts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fee_receipts" ADD CONSTRAINT "fee_receipts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."hearings" ADD CONSTRAINT "hearings_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."hearings" ADD CONSTRAINT "hearings_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "app"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "app"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."practice_profiles" ADD CONSTRAINT "practice_profiles_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "app"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_owner_id_name_index" ON "app"."clients" USING btree ("owner_id","name");--> statement-breakpoint
CREATE INDEX "fee_receipts_owner_id_received_on_index" ON "app"."fee_receipts" USING btree ("owner_id","received_on");--> statement-breakpoint
CREATE INDEX "fee_receipts_invoice_id_index" ON "app"."fee_receipts" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "hearings_owner_id_hearing_date_index" ON "app"."hearings" USING btree ("owner_id","hearing_date");--> statement-breakpoint
CREATE INDEX "hearings_matter_id_index" ON "app"."hearings" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "invoices_owner_id_issue_date_index" ON "app"."invoices" USING btree ("owner_id","issue_date");--> statement-breakpoint
CREATE INDEX "invoices_client_id_index" ON "app"."invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "tasks_owner_id_done_due_date_index" ON "app"."tasks" USING btree ("owner_id","done","due_date");--> statement-breakpoint
ALTER TABLE "app"."matters" ADD CONSTRAINT "matters_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE set null ON UPDATE no action;