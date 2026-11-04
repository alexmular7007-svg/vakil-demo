ALTER TABLE "app"."advocate_profiles" ADD CONSTRAINT "advocate_profiles_status_ck" CHECK ("app"."advocate_profiles"."verification_status" in ('pending', 'verified', 'rejected'));--> statement-breakpoint
ALTER TABLE "app"."chats" ADD CONSTRAINT "chats_mode_ck" CHECK ("app"."chats"."mode" in ('research', 'draft', 'explain', 'general'));--> statement-breakpoint
ALTER TABLE "app"."clients" ADD CONSTRAINT "clients_kind_ck" CHECK ("app"."clients"."kind" in ('individual', 'business'));--> statement-breakpoint
ALTER TABLE "app"."consultations" ADD CONSTRAINT "consultations_status_ck" CHECK ("app"."consultations"."status" in ('requested', 'accepted', 'declined', 'closed'));--> statement-breakpoint
ALTER TABLE "app"."documents" ADD CONSTRAINT "documents_status_ck" CHECK ("app"."documents"."status" in ('processing', 'ready', 'failed'));--> statement-breakpoint
ALTER TABLE "app"."drafts" ADD CONSTRAINT "drafts_status_ck" CHECK ("app"."drafts"."status" in ('draft', 'final'));--> statement-breakpoint
ALTER TABLE "app"."fee_receipts" ADD CONSTRAINT "fee_receipts_mode_ck" CHECK ("app"."fee_receipts"."mode" in ('cash', 'upi', 'bank', 'cheque', 'other'));--> statement-breakpoint
ALTER TABLE "app"."fee_receipts" ADD CONSTRAINT "fee_receipts_amount_ck" CHECK ("app"."fee_receipts"."amount_paise" > 0);--> statement-breakpoint
ALTER TABLE "app"."hearings" ADD CONSTRAINT "hearings_status_ck" CHECK ("app"."hearings"."status" in ('scheduled', 'done', 'adjourned', 'cancelled'));--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_status_ck" CHECK ("app"."invoices"."status" in ('draft', 'issued', 'partly_paid', 'paid', 'cancelled'));--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_gst_mode_ck" CHECK ("app"."invoices"."gst_mode" in ('none', 'forward', 'reverse_charge'));--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_amounts_ck" CHECK ("app"."invoices"."subtotal_paise" >= 0 and "app"."invoices"."tax_paise" >= 0 and "app"."invoices"."total_paise" >= 0 and "app"."invoices"."gst_rate_bp" between 0 and 2800);--> statement-breakpoint
ALTER TABLE "app"."matters" ADD CONSTRAINT "matters_status_ck" CHECK ("app"."matters"."status" in ('open', 'closed'));--> statement-breakpoint
ALTER TABLE "ai"."prompts" ADD CONSTRAINT "prompts_visibility_ck" CHECK ("ai"."prompts"."visibility" in ('private', 'public'));--> statement-breakpoint
ALTER TABLE "esign"."envelopes" ADD CONSTRAINT "envelopes_status_ck" CHECK ("esign"."envelopes"."status" in ('DRAFT', 'OUT_FOR_SIGNATURE', 'PARTIALLY_SIGNED', 'COMPLETED', 'DECLINED', 'EXPIRED', 'VOIDED'));--> statement-breakpoint
ALTER TABLE "esign"."envelopes" ADD CONSTRAINT "envelopes_signature_type_ck" CHECK ("esign"."envelopes"."signature_type" in ('electronic', 'aadhaar'));--> statement-breakpoint
ALTER TABLE "esign"."recipients" ADD CONSTRAINT "recipients_role_ck" CHECK ("esign"."recipients"."role_label" in ('SENDER', 'RECEIVER', 'LAWYER', 'OTHER'));--> statement-breakpoint
ALTER TABLE "esign"."recipients" ADD CONSTRAINT "recipients_action_ck" CHECK ("esign"."recipients"."action" in ('REVIEW', 'SIGN', 'WITNESS', 'CC'));--> statement-breakpoint
ALTER TABLE "esign"."recipients" ADD CONSTRAINT "recipients_status_ck" CHECK ("esign"."recipients"."status" in ('PENDING', 'SENT', 'VIEWED', 'APPROVED', 'SIGNED', 'DECLINED'));--> statement-breakpoint
ALTER TABLE "corpus"."legal_updates" ADD CONSTRAINT "legal_updates_kind_ck" CHECK ("corpus"."legal_updates"."kind" in ('act', 'amendment', 'bill', 'ordinance', 'notification', 'judgment', 'news'));--> statement-breakpoint
ALTER TABLE "corpus"."legal_updates" ADD CONSTRAINT "legal_updates_importance_ck" CHECK ("corpus"."legal_updates"."importance" in ('high', 'normal', 'hidden'));--> statement-breakpoint
ALTER TABLE "billing"."payments" ADD CONSTRAINT "payments_status_ck" CHECK ("billing"."payments"."status" in ('created', 'paid', 'failed'));--> statement-breakpoint
ALTER TABLE "billing"."payments" ADD CONSTRAINT "payments_amount_ck" CHECK ("billing"."payments"."amount_paise" >= 0);--> statement-breakpoint
ALTER TABLE "corpus"."section_revisions" ADD CONSTRAINT "section_revisions_source_ck" CHECK ("corpus"."section_revisions"."source" in ('india_code', 'admin'));--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_status_ck" CHECK ("billing"."subscriptions"."status" in ('active', 'past_due', 'cancelled'));--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_interval_ck" CHECK ("billing"."subscriptions"."interval" in ('month', 'year'));--> statement-breakpoint
ALTER TABLE "corpus"."sync_runs" ADD CONSTRAINT "sync_runs_kind_ck" CHECK ("corpus"."sync_runs"."kind" in ('india_code', 'feeds', 'judgments'));--> statement-breakpoint
ALTER TABLE "corpus"."sync_runs" ADD CONSTRAINT "sync_runs_status_ck" CHECK ("corpus"."sync_runs"."status" in ('running', 'ok', 'partial', 'failed'));