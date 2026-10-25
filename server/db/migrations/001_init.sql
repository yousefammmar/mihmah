-- Mihmah initial schema. All timestamps are timestamptz (stored UTC); the UI renders them in Asia/Amman.
-- State columns are the single source of truth; dashboard counts are computed from these rows.

-- Arabic-aware search normalisation: unify alef/taa marbuta/alef maqsura forms and drop diacritics + tatweel.
create function ar_norm(text) returns text language sql immutable parallel safe as $$
  select lower(translate($1, 'أإآةىًٌٍَُِّْـ', 'اااهي'))
$$;

-- ---------- accounts ----------
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) between 3 and 254),
  password_hash text not null,
  role text not null check (role in ('student', 'company', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  suspended_reason text,
  email_verified_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'suspended' or suspended_reason is not null)
);
create unique index users_email_key on users (lower(email));

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash bytea not null unique,
  csrf_token text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text
);
create index sessions_user_idx on sessions (user_id) where revoked_at is null;

create table email_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  purpose text not null check (purpose in ('verify_email', 'reset_password')),
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_tokens_user_idx on email_tokens (user_id, purpose);

-- ---------- profiles & skills ----------
create table student_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  full_name text not null check (length(full_name) between 2 and 100),
  university text,
  major text,
  bio text check (length(bio) <= 1000),
  portfolio_url text,
  updated_at timestamptz not null default now()
);

create table company_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  company_name text not null check (length(company_name) between 2 and 120),
  contact_name text not null check (length(contact_name) between 2 and 100),
  industry text,
  city text,
  bio text check (length(bio) <= 1000),
  -- A badge is shown only when status = 'verified', which only an admin action can set.
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  verification_note text,
  verified_at timestamptz,
  verified_by uuid references users (id),
  updated_at timestamptz not null default now(),
  check (verification_status <> 'verified' or (verified_at is not null and verified_by is not null))
);

create table skills (
  id serial primary key,
  name text not null check (length(name) between 1 and 40)
);
create unique index skills_name_key on skills (lower(name));

create table student_skills (
  student_id uuid not null references users (id) on delete cascade,
  skill_id int not null references skills (id) on delete cascade,
  primary key (student_id, skill_id)
);

-- ---------- tasks ----------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references users (id) on delete cascade,
  title text not null check (length(title) between 10 and 90),
  category text not null check (category in ('design', 'web', 'data', 'slides')),
  summary text not null check (length(summary) between 30 and 300),
  scope text not null check (length(scope) between 40 and 2000),
  deliverables text[] not null check (cardinality(deliverables) between 1 and 8),
  milestone_template text[] not null check (cardinality(milestone_template) between 1 and 6),
  budget_amount numeric(10, 3) not null check (budget_amount between 10 and 2000),
  currency char(3) not null default 'JOD' check (currency = 'JOD'),
  duration_days int not null check (duration_days between 1 and 60),
  deadline_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'assigned', 'completed', 'cancelled')),
  cancel_reason text,
  moderation_status text not null default 'visible' check (moderation_status in ('visible', 'hidden')),
  moderation_reason text,
  published_at timestamptz,
  assigned_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'cancelled' or cancel_reason is not null),
  check (moderation_status <> 'hidden' or moderation_reason is not null)
);
create index tasks_public_idx on tasks (status, published_at desc) where moderation_status = 'visible';
create index tasks_company_idx on tasks (company_id, created_at desc);

create table task_skills (
  task_id uuid not null references tasks (id) on delete cascade,
  skill_id int not null references skills (id) on delete cascade,
  primary key (task_id, skill_id)
);
create index task_skills_skill_idx on task_skills (skill_id);

create table saved_tasks (
  student_id uuid not null references users (id) on delete cascade,
  task_id uuid not null references tasks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, task_id)
);

-- ---------- applications & offers ----------
create table applications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id) on delete cascade,
  student_id uuid not null references users (id) on delete cascade,
  proposal text not null check (length(proposal) between 50 and 2000),
  portfolio_url text,
  delivery_days int not null check (delivery_days between 1 and 60),
  status text not null default 'submitted' check (status in ('submitted', 'withdrawn', 'rejected', 'offered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One application per student per task, ever (a withdrawn application cannot be resubmitted).
  unique (task_id, student_id)
);
create index applications_student_idx on applications (student_id, created_at desc);

create table offers (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id) on delete cascade,
  application_id uuid not null unique references applications (id) on delete cascade,
  company_id uuid not null references users (id),
  student_id uuid not null references users (id),
  message text check (length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired', 'withdrawn')),
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
-- Database-level guarantee: a single-assignee task can have at most one accepted offer.
create unique index offers_one_accepted_per_task on offers (task_id) where status = 'accepted';
create index offers_student_idx on offers (student_id, status);
create index offers_task_idx on offers (task_id, status);

-- ---------- projects ----------
create table projects (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references tasks (id) on delete cascade,
  offer_id uuid not null unique references offers (id),
  company_id uuid not null references users (id),
  student_id uuid not null references users (id),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'awaiting_review', 'revision_requested', 'completed', 'cancelled')),
  cancel_reason text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (status <> 'completed' or completed_at is not null)
);
create index projects_student_idx on projects (student_id, status);
create index projects_company_idx on projects (company_id, status);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  title text not null check (length(title) between 2 and 120),
  position int not null,
  due_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index milestones_project_idx on milestones (project_id, position);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid not null references users (id),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on messages (conversation_id, created_at);

create table deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  round int not null check (round >= 1),
  note text not null check (length(note) between 10 and 2000),
  links text[] not null default '{}',
  submitted_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  unique (project_id, round)
);

create table deliverable_reviews (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null unique references deliverables (id) on delete cascade,
  decision text not null check (decision in ('revision_requested', 'approved')),
  feedback text,
  reviewer_id uuid not null references users (id),
  created_at timestamptz not null default now(),
  check (decision <> 'revision_requested' or length(feedback) >= 15)
);

-- Private files: storage_key is generated server-side and never derived from the upload name.
create table attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  uploader_id uuid not null references users (id),
  storage_key text not null unique,
  original_name text not null check (length(original_name) between 1 and 200),
  mime_type text not null,
  size_bytes int not null check (size_bytes > 0),
  message_id uuid references messages (id) on delete set null,
  deliverable_id uuid references deliverables (id) on delete set null,
  created_at timestamptz not null default now()
);
create index attachments_project_idx on attachments (project_id, created_at);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  reviewer_id uuid not null references users (id),
  reviewee_id uuid not null references users (id),
  rating int not null check (rating between 1 and 5),
  comment text not null check (length(comment) between 15 and 1000),
  created_at timestamptz not null default now(),
  unique (project_id, reviewer_id)
);
create index reviews_reviewee_idx on reviews (reviewee_id);

-- ---------- notifications ----------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  type text not null,
  title text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table notification_preferences (
  user_id uuid primary key references users (id) on delete cascade,
  email_applications boolean not null default true,
  email_offers boolean not null default true,
  email_projects boolean not null default true,
  email_messages boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------- payments (kept separate from project status) ----------
create table payments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id) on delete cascade,
  project_id uuid unique references projects (id) on delete cascade,
  company_id uuid not null references users (id),
  student_id uuid references users (id),
  amount numeric(10, 3) not null check (amount > 0),
  platform_fee numeric(10, 3) not null default 0 check (platform_fee >= 0),
  currency char(3) not null default 'JOD',
  provider text not null check (provider in ('none', 'sandbox')),
  is_live boolean not null default false check (is_live = false), -- live money movement is disabled
  status text not null default 'pending_integration'
    check (status in ('pending_integration', 'awaiting_payment', 'authorized', 'captured', 'payout_pending', 'paid_out', 'refunded', 'failed', 'cancelled')),
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payment_events (
  id bigserial primary key,
  payment_id uuid not null references payments (id) on delete cascade,
  type text not null,
  from_status text,
  to_status text,
  source text not null check (source in ('system', 'provider_webhook', 'admin')),
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index payment_events_payment_idx on payment_events (payment_id, created_at);

-- ---------- trust & safety ----------
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users (id) on delete cascade,
  target_type text not null check (target_type in ('task', 'user', 'project')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'fraud', 'inappropriate', 'dispute', 'other')),
  details text not null check (length(details) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by uuid references users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (status = 'open' or (resolution_note is not null and resolved_by is not null))
);
create index reports_status_idx on reports (status, created_at desc);
create index reports_target_idx on reports (target_type, target_id);

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references users (id),
  action text not null,
  target_type text not null,
  target_id uuid not null,
  reason text not null check (length(reason) >= 5),
  report_id uuid references reports (id),
  created_at timestamptz not null default now()
);
create index moderation_target_idx on moderation_actions (target_type, target_id);

create table audit_events (
  id bigserial primary key,
  actor_id uuid references users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_entity_idx on audit_events (entity_type, entity_id, created_at desc);
create index audit_actor_idx on audit_events (actor_id, created_at desc);
