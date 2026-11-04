CREATE SCHEMA "app";
--> statement-breakpoint
CREATE SCHEMA "ai";
--> statement-breakpoint
CREATE SCHEMA "esign";
--> statement-breakpoint
CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE SCHEMA "billing";
--> statement-breakpoint
CREATE SCHEMA "corpus";
--> statement-breakpoint
CREATE SCHEMA "privacy";
--> statement-breakpoint
CREATE TABLE "app"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "app"."two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"two_factor_enabled" boolean DEFAULT false,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"phone" text,
	"locale" text DEFAULT 'en',
	"persona" text DEFAULT 'advocate',
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "app"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."advocate_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"enrolment_no" text NOT NULL,
	"state_bar_council" text NOT NULL,
	"enrolment_year" integer,
	"practice_areas" text[] DEFAULT '{}'::text[] NOT NULL,
	"courts" text[] DEFAULT '{}'::text[] NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"city" text,
	"state" text,
	"bio" text,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"rejection_reason" text,
	"is_listed" boolean DEFAULT false NOT NULL,
	"accepts_consultations" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"matter_id" uuid,
	"assistant_id" uuid,
	"mode" text DEFAULT 'research' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."consultations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" text NOT NULL,
	"advocate_id" text NOT NULL,
	"chat_id" uuid,
	"subject" text NOT NULL,
	"summary" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"advocate_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"idx" integer NOT NULL,
	"content" text NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
);
--> statement-breakpoint
CREATE TABLE "app"."documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"matter_id" uuid,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"page_count" integer,
	"text_content" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."draft_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_versions_draftId_version_unique" UNIQUE("draft_id","version")
);
--> statement-breakpoint
CREATE TABLE "app"."drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"matter_id" uuid,
	"template_slug" text,
	"title" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."matters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"client_name" text,
	"court" text,
	"case_no" text,
	"offence_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"citations" jsonb,
	"provider" text,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "app"."templates" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_hi" text,
	"category" text NOT NULL,
	"summary" text NOT NULL,
	"fields" jsonb NOT NULL,
	"body_en" text NOT NULL,
	"body_hi" text,
	"law_refs" text[] DEFAULT '{}'::text[] NOT NULL,
	"esign_allowed" boolean DEFAULT true NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai"."assistants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"instructions" text NOT NULL,
	"model_tier" text DEFAULT 'standard' NOT NULL,
	"knowledge_document_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"icon" text DEFAULT 'scale' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai"."feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" text NOT NULL,
	"reason" text,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai"."prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai"."settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai"."usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"queries" integer DEFAULT 0 NOT NULL,
	"tokens_in" bigint DEFAULT 0 NOT NULL,
	"tokens_out" bigint DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_ledger_userId_day_unique" UNIQUE("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "esign"."envelopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"doc_category" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"signature_type" text DEFAULT 'electronic' NOT NULL,
	"provider" text DEFAULT 'internal' NOT NULL,
	"provider_ref" text,
	"original_name" text NOT NULL,
	"original_storage_key" text NOT NULL,
	"original_sha256" text NOT NULL,
	"locked_sha256" text,
	"final_storage_key" text,
	"final_sha256" text,
	"expires_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esign"."events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"envelope_id" uuid NOT NULL,
	"recipient_id" uuid,
	"type" text NOT NULL,
	"document_sha256" text,
	"ip" text,
	"user_agent" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esign"."otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esign"."recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"envelope_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role_label" text NOT NULL,
	"action" text NOT NULL,
	"routing_order" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"auth_method" text DEFAULT 'email_otp' NOT NULL,
	"access_token_hash" text NOT NULL,
	"advocate_user_id" text,
	"signature_kind" text,
	"signature_text" text,
	"signature_image" text,
	"signed_sha256" text,
	"acted_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"decline_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corpus"."acts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"short_title" text NOT NULL,
	"act_no" text,
	"year" integer NOT NULL,
	"in_force_from" date,
	"repealed_on" date,
	"replaced_by" text,
	"source_url" text NOT NULL,
	"source_note" text
);
--> statement-breakpoint
CREATE TABLE "audit"."events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor_id" text,
	"actor_role" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"ip" text,
	"data" jsonb,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corpus"."code_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"old_act" text NOT NULL,
	"old_section" text NOT NULL,
	"new_act" text NOT NULL,
	"new_section" text NOT NULL,
	"subject" text,
	"note" text,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy"."consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"notice_version" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "corpus"."judgment_paras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judgment_id" uuid NOT NULL,
	"para_no" integer NOT NULL,
	"text" text NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', text)) STORED
);
--> statement-breakpoint
CREATE TABLE "corpus"."judgments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"court" text NOT NULL,
	"title" text NOT NULL,
	"decided_on" date,
	"citation" text,
	"case_no" text,
	"bench" text,
	"source_url" text,
	"licence" text DEFAULT 'CC-BY-4.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text,
	"interval" text,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text,
	"provider_payment_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "payments_providerOrderId_unique" UNIQUE("provider_order_id")
);
--> statement-breakpoint
CREATE TABLE "billing"."plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tagline" text NOT NULL,
	"price_paise_month" integer NOT NULL,
	"price_paise_year" integer NOT NULL,
	"features" jsonb NOT NULL,
	"limits" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy"."rights_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"response" text,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "corpus"."sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"act_id" text NOT NULL,
	"section_no" text NOT NULL,
	"sort_key" integer NOT NULL,
	"heading" text NOT NULL,
	"chapter" text,
	"text" text NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading, '') || ' ' || coalesce(text, ''))) STORED,
	CONSTRAINT "sections_actId_sectionNo_unique" UNIQUE("act_id","section_no")
);
--> statement-breakpoint
CREATE TABLE "billing"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" text NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_events_provider_providerEventId_unique" UNIQUE("provider","provider_event_id")
);
--> statement-breakpoint
ALTER TABLE "app"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."advocate_profiles" ADD CONSTRAINT "advocate_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."chats" ADD CONSTRAINT "chats_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."chats" ADD CONSTRAINT "chats_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "app"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."consultations" ADD CONSTRAINT "consultations_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."consultations" ADD CONSTRAINT "consultations_advocate_id_user_id_fk" FOREIGN KEY ("advocate_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."consultations" ADD CONSTRAINT "consultations_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "app"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "app"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document_chunks" ADD CONSTRAINT "document_chunks_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."documents" ADD CONSTRAINT "documents_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."documents" ADD CONSTRAINT "documents_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "app"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."draft_versions" ADD CONSTRAINT "draft_versions_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "app"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."draft_versions" ADD CONSTRAINT "draft_versions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."drafts" ADD CONSTRAINT "drafts_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."drafts" ADD CONSTRAINT "drafts_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "app"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."drafts" ADD CONSTRAINT "drafts_template_slug_templates_slug_fk" FOREIGN KEY ("template_slug") REFERENCES "app"."templates"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."matters" ADD CONSTRAINT "matters_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "app"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai"."assistants" ADD CONSTRAINT "assistants_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai"."feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai"."prompts" ADD CONSTRAINT "prompts_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai"."usage_ledger" ADD CONSTRAINT "usage_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign"."envelopes" ADD CONSTRAINT "envelopes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign"."events" ADD CONSTRAINT "events_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "esign"."envelopes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign"."otp_codes" ADD CONSTRAINT "otp_codes_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "esign"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign"."recipients" ADD CONSTRAINT "recipients_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "esign"."envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy"."consents" ADD CONSTRAINT "consents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus"."judgment_paras" ADD CONSTRAINT "judgment_paras_judgment_id_judgments_id_fk" FOREIGN KEY ("judgment_id") REFERENCES "corpus"."judgments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."payments" ADD CONSTRAINT "payments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."payments" ADD CONSTRAINT "payments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "billing"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy"."rights_requests" ADD CONSTRAINT "rights_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus"."sections" ADD CONSTRAINT "sections_act_id_acts_id_fk" FOREIGN KEY ("act_id") REFERENCES "corpus"."acts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "billing"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chats_owner_id_updated_at_index" ON "app"."chats" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "consultations_requester_id_index" ON "app"."consultations" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "consultations_advocate_id_index" ON "app"."consultations" USING btree ("advocate_id");--> statement-breakpoint
CREATE INDEX "document_chunks_document_id_index" ON "app"."document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_chunks_tsv_idx" ON "app"."document_chunks" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "documents_owner_id_index" ON "app"."documents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "documents_matter_id_index" ON "app"."documents" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "drafts_owner_id_updated_at_index" ON "app"."drafts" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "matters_owner_id_index" ON "app"."matters" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "messages_chat_id_created_at_index" ON "app"."messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "assistants_owner_id_index" ON "ai"."assistants" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "prompts_owner_id_index" ON "ai"."prompts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "envelopes_owner_id_updated_at_index" ON "esign"."envelopes" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "events_envelope_id_seq_index" ON "esign"."events" USING btree ("envelope_id","seq");--> statement-breakpoint
CREATE INDEX "recipients_envelope_id_index" ON "esign"."recipients" USING btree ("envelope_id");--> statement-breakpoint
CREATE INDEX "events_entity_type_entity_id_index" ON "audit"."events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "events_actor_id_index" ON "audit"."events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "code_map_old_act_old_section_index" ON "corpus"."code_map" USING btree ("old_act","old_section");--> statement-breakpoint
CREATE INDEX "code_map_new_act_new_section_index" ON "corpus"."code_map" USING btree ("new_act","new_section");--> statement-breakpoint
CREATE INDEX "consents_user_id_index" ON "privacy"."consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "judgment_paras_tsv_idx" ON "corpus"."judgment_paras" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "judgment_paras_judgment_id_index" ON "corpus"."judgment_paras" USING btree ("judgment_id");--> statement-breakpoint
CREATE INDEX "judgments_court_decided_on_index" ON "corpus"."judgments" USING btree ("court","decided_on");--> statement-breakpoint
CREATE INDEX "payments_user_id_index" ON "billing"."payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rights_requests_user_id_index" ON "privacy"."rights_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sections_tsv_idx" ON "corpus"."sections" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_index" ON "billing"."subscriptions" USING btree ("user_id");