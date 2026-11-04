-- Vaakil AI database security layer. Idempotent: safe to run after every migration.
--
-- Model:
--   * User-facing queries run inside withUser(): `SET LOCAL ROLE app_user` plus
--     `app.user_id`. app_user is not the table owner, so row-level security (RLS)
--     always applies to it and it can only touch its own rows.
--   * Server-only service code (auth, webhooks, admin, e-sign signer portal) runs
--     as the owner and performs explicit authorization checks before every write.
--   * Legal records are append-only: audit.events, esign.events,
--     app.draft_versions and corpus.section_revisions reject UPDATE and direct
--     DELETE via triggers.
--   * Rows can only reference rows of the same owner (app.assert_same_owner).
--   * Text "enum" columns are guarded by CHECK constraints (schema/enums.ts).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end
$$;

do $$
begin
  execute format('grant app_user to %I', current_user);
exception when others then
  -- Superusers (local PGlite) can already SET ROLE; managed hosts may need this granted by an admin.
  null;
end
$$;

grant usage on schema app, ai, esign, billing, privacy, corpus to app_user;
revoke all on schema audit from app_user;
grant usage on all sequences in schema app, ai, esign, billing, privacy to app_user;

-- ---------------------------------------------------------------------------
-- Table privileges for app_user (RLS narrows these to the user's own rows)
-- ---------------------------------------------------------------------------
grant select, insert, update on app.update_receipts to app_user;
grant select, insert, update, delete on
  app.matters, app.documents, app.document_chunks, app.chats, app.messages, app.drafts,
  app.clients, app.hearings, app.tasks, app.practice_profiles, app.invoices, app.fee_receipts
  to app_user;
grant select, insert on app.draft_versions to app_user;
grant select on app.templates to app_user;
-- Advocate profiles: column-level UPDATE so verification fields can never be
-- changed by app_user (a table-wide grant would cover every column).
revoke update on app.advocate_profiles from app_user;
grant select, insert on app.advocate_profiles to app_user;
grant update (display_name, enrolment_no, state_bar_council, enrolment_year, practice_areas, courts,
  languages, city, state, bio, is_listed, accepts_consultations, updated_at)
  on app.advocate_profiles to app_user;
grant select, insert, update on app.consultations to app_user;
grant select, insert, update, delete on ai.prompts, ai.assistants to app_user;
grant select on ai.usage_ledger to app_user;
grant select, insert on ai.feedback to app_user;
grant select on esign.envelopes, esign.recipients, esign.events to app_user;
grant select on billing.plans, billing.subscriptions, billing.payments, billing.feature_trials to app_user;
grant select, insert, update on privacy.consents to app_user;
grant select, insert on privacy.rights_requests to app_user;
grant select on all tables in schema corpus to app_user;

-- Never readable by app_user
revoke all on app.user, app.session, app.account, app.verification, app.two_factor,
  app.outbox, app.rate_limits, app.auth_rate_limit, ai.settings, esign.otp_codes, billing.webhook_events
  from app_user;

-- ---------------------------------------------------------------------------
-- Row-level security policies
-- ---------------------------------------------------------------------------
create or replace function app.current_user_id() returns text
  language sql stable as $$ select nullif(current_setting('app.user_id', true), '') $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'app.matters', 'app.documents', 'app.document_chunks', 'app.chats', 'app.messages',
    'app.drafts', 'app.draft_versions', 'ai.assistants',
    'app.clients', 'app.hearings', 'app.tasks', 'app.practice_profiles', 'app.invoices', 'app.fee_receipts'
  ]
  loop
    execute format('alter table %s enable row level security', t);
    execute format('drop policy if exists owner_all on %s', t);
    execute format(
      'create policy owner_all on %s for all to app_user using (owner_id = app.current_user_id()) with check (owner_id = app.current_user_id())',
      t
    );
  end loop;
end
$$;

-- Prompts: own prompts, plus the built-in library (owner_id null) and public ones read-only.
alter table ai.prompts enable row level security;
drop policy if exists prompts_read on ai.prompts;
drop policy if exists prompts_write on ai.prompts;
create policy prompts_read on ai.prompts for select to app_user
  using (owner_id is null or visibility = 'public' or owner_id = app.current_user_id());
create policy prompts_write on ai.prompts for all to app_user
  using (owner_id = app.current_user_id()) with check (owner_id = app.current_user_id());

-- Usage, feedback, consents, rights requests, subscriptions, payments: own rows only.
do $$
declare
  t text;
begin
  foreach t in array array[
    'ai.usage_ledger', 'ai.feedback', 'privacy.consents', 'privacy.rights_requests',
    'billing.subscriptions', 'billing.payments', 'app.update_receipts', 'billing.feature_trials'
  ]
  loop
    execute format('alter table %s enable row level security', t);
    execute format('drop policy if exists own_rows on %s', t);
    execute format(
      'create policy own_rows on %s for all to app_user using (user_id = app.current_user_id()) with check (user_id = app.current_user_id())',
      t
    );
  end loop;
end
$$;

-- Advocate profiles: anyone may read verified + listed profiles; an advocate manages
-- their own, but can never mark themselves verified.
alter table app.advocate_profiles enable row level security;
drop policy if exists advocate_read on app.advocate_profiles;
drop policy if exists advocate_insert on app.advocate_profiles;
drop policy if exists advocate_update on app.advocate_profiles;
create policy advocate_read on app.advocate_profiles for select to app_user
  using ((verification_status = 'verified' and is_listed) or user_id = app.current_user_id());
create policy advocate_insert on app.advocate_profiles for insert to app_user
  with check (user_id = app.current_user_id() and verification_status = 'pending');
create policy advocate_update on app.advocate_profiles for update to app_user
  using (user_id = app.current_user_id()) with check (user_id = app.current_user_id());

-- Consultations: visible to requester and the advocate.
alter table app.consultations enable row level security;
drop policy if exists consult_rw on app.consultations;
create policy consult_rw on app.consultations for all to app_user
  using (requester_id = app.current_user_id() or advocate_id = app.current_user_id())
  with check (requester_id = app.current_user_id() or advocate_id = app.current_user_id());

-- E-sign: the envelope owner reads envelopes, recipients and events.
alter table esign.envelopes enable row level security;
drop policy if exists env_owner_read on esign.envelopes;
create policy env_owner_read on esign.envelopes for select to app_user
  using (owner_id = app.current_user_id());

alter table esign.recipients enable row level security;
drop policy if exists rcpt_owner_read on esign.recipients;
create policy rcpt_owner_read on esign.recipients for select to app_user
  using (exists (select 1 from esign.envelopes e where e.id = envelope_id and e.owner_id = app.current_user_id()));

alter table esign.events enable row level security;
drop policy if exists evt_owner_read on esign.events;
create policy evt_owner_read on esign.events for select to app_user
  using (exists (select 1 from esign.envelopes e where e.id = envelope_id and e.owner_id = app.current_user_id()));

-- Public reference data
alter table app.templates enable row level security;
drop policy if exists templates_read on app.templates;
create policy templates_read on app.templates for select to app_user using (is_published);

alter table billing.plans enable row level security;
drop policy if exists plans_read on billing.plans;
create policy plans_read on billing.plans for select to app_user using (is_active);

-- ---------------------------------------------------------------------------
-- Same-owner references
-- A foreign key proves the referenced row exists, not that it belongs to the same
-- user (foreign-key checks bypass RLS). This trigger closes that gap: a row may only
-- point at rows owned by the same user. Under app_user, RLS hides other users' rows,
-- so a foreign id finds no owner and is refused as well.
-- args: (fk column, referenced table, owner column of this table = owner_id)
-- ---------------------------------------------------------------------------
create or replace function app.assert_same_owner() returns trigger
  language plpgsql as $$
declare
  fk_col text := tg_argv[0];
  ref_table text := tg_argv[1];
  owner_col text := coalesce(tg_argv[2], 'owner_id');
  ref_id text := to_jsonb(new) ->> fk_col;
  row_owner text := to_jsonb(new) ->> owner_col;
  ref_owner text;
begin
  if ref_id is null then
    return new;
  end if;
  execute format('select owner_id from %s where id = $1::uuid', ref_table) into ref_owner using ref_id;
  if ref_owner is distinct from row_owner then
    raise exception '%.% must reference a row owned by the same user', tg_table_name, fk_col
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('app.matters', 'client_id', 'app.clients', 'owner_id'),
      ('app.documents', 'matter_id', 'app.matters', 'owner_id'),
      ('app.document_chunks', 'document_id', 'app.documents', 'owner_id'),
      ('app.chats', 'matter_id', 'app.matters', 'owner_id'),
      ('app.messages', 'chat_id', 'app.chats', 'owner_id'),
      ('app.drafts', 'matter_id', 'app.matters', 'owner_id'),
      ('app.draft_versions', 'draft_id', 'app.drafts', 'owner_id'),
      ('app.consultations', 'chat_id', 'app.chats', 'requester_id'),
      ('app.hearings', 'matter_id', 'app.matters', 'owner_id'),
      ('app.tasks', 'matter_id', 'app.matters', 'owner_id'),
      ('app.invoices', 'client_id', 'app.clients', 'owner_id'),
      ('app.invoices', 'matter_id', 'app.matters', 'owner_id'),
      ('app.fee_receipts', 'invoice_id', 'app.invoices', 'owner_id'),
      ('app.fee_receipts', 'client_id', 'app.clients', 'owner_id')
    ) as t(tbl, col, ref, owner_col)
  loop
    execute format('drop trigger if exists %I on %s', 'same_owner_' || r.col, r.tbl);
    execute format(
      'create trigger %I before insert or update of %I on %s for each row execute function app.assert_same_owner(%L, %L, %L)',
      'same_owner_' || r.col, r.col, r.tbl, r.col, r.ref, r.owner_col
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Append-only legal records
-- ---------------------------------------------------------------------------
create or replace function audit.block_mutation() returns trigger
  language plpgsql as $$
begin
  -- Allow rows to disappear only through a cascading parent delete (depth > 1).
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 and tg_table_name = 'draft_versions' then
    return old;
  end if;
  raise exception 'append-only table %.%: % is not allowed', tg_table_schema, tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end
$$;

drop trigger if exists append_only on audit.events;
create trigger append_only before update or delete on audit.events
  for each row execute function audit.block_mutation();

drop trigger if exists append_only on esign.events;
create trigger append_only before update or delete on esign.events
  for each row execute function audit.block_mutation();

drop trigger if exists append_only on app.draft_versions;
create trigger append_only before update or delete on app.draft_versions
  for each row execute function audit.block_mutation();

-- The history of every statute change is kept for good.
drop trigger if exists append_only on corpus.section_revisions;
create trigger append_only before update or delete on corpus.section_revisions
  for each row execute function audit.block_mutation();

-- Envelopes: the frozen hashes and terminal states can never change.
create or replace function esign.protect_envelope() returns trigger
  language plpgsql as $$
begin
  if new.original_sha256 is distinct from old.original_sha256 then
    raise exception 'original document hash is immutable' using errcode = 'insufficient_privilege';
  end if;
  if old.locked_sha256 is not null and new.locked_sha256 is distinct from old.locked_sha256 then
    raise exception 'locked document hash is immutable' using errcode = 'insufficient_privilege';
  end if;
  if old.final_sha256 is not null and new.final_sha256 is distinct from old.final_sha256 then
    raise exception 'final document hash is immutable' using errcode = 'insufficient_privilege';
  end if;
  if old.status in ('COMPLETED', 'VOIDED', 'DECLINED', 'EXPIRED') and new.status is distinct from old.status then
    raise exception 'envelope in terminal state % cannot change', old.status using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

drop trigger if exists protect_envelope on esign.envelopes;
create trigger protect_envelope before update on esign.envelopes
  for each row execute function esign.protect_envelope();

create or replace function esign.block_envelope_delete() returns trigger
  language plpgsql as $$
begin
  if old.status <> 'DRAFT' then
    raise exception 'only draft envelopes can be deleted' using errcode = 'insufficient_privilege';
  end if;
  return old;
end
$$;

drop trigger if exists block_envelope_delete on esign.envelopes;
create trigger block_envelope_delete before delete on esign.envelopes
  for each row execute function esign.block_envelope_delete();
