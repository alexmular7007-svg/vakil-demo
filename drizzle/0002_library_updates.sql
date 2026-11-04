CREATE TABLE "corpus"."legal_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"source_name" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"url" text NOT NULL,
	"published_at" timestamp with time zone,
	"importance" text DEFAULT 'normal' NOT NULL,
	"acts" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_updates_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "corpus"."section_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"act_id" text NOT NULL,
	"section_no" text NOT NULL,
	"before_heading" text,
	"before_text" text,
	"after_heading" text,
	"after_text" text,
	"source" text NOT NULL,
	"source_ref" text,
	"changed_by" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corpus"."sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "app"."update_receipts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corpus"."acts" ADD COLUMN "tracked" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "corpus"."acts" ADD COLUMN "source_version" text;--> statement-breakpoint
ALTER TABLE "corpus"."acts" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "corpus"."acts" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "corpus"."judgments" ADD COLUMN "source_key" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "corpus"."judgments" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "corpus"."judgments" ADD COLUMN "parties" text;--> statement-breakpoint
ALTER TABLE "corpus"."judgments" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "corpus"."judgments" ADD COLUMN "added_by" text;--> statement-breakpoint
ALTER TABLE "app"."update_receipts" ADD CONSTRAINT "update_receipts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_updates_published_at_index" ON "corpus"."legal_updates" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "legal_updates_importance_created_at_index" ON "corpus"."legal_updates" USING btree ("importance","created_at");--> statement-breakpoint
CREATE INDEX "section_revisions_act_id_section_no_index" ON "corpus"."section_revisions" USING btree ("act_id","section_no");--> statement-breakpoint
CREATE INDEX "section_revisions_created_at_index" ON "corpus"."section_revisions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sync_runs_kind_started_at_index" ON "corpus"."sync_runs" USING btree ("kind","started_at");--> statement-breakpoint
ALTER TABLE "corpus"."judgments" ADD CONSTRAINT "judgments_sourceKey_externalId_unique" UNIQUE("source_key","external_id");