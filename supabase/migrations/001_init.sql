create type workspace_role as enum ('owner', 'admin', 'member', 'viewer');

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role workspace_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  position integer not null default 0,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lists (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  position integer not null default 0,
  wip_limit integer check (wip_limit is null or wip_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cards (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text not null default '',
  position integer not null default 0,
  assignee_ids uuid[] not null default '{}',
  due_at timestamptz,
  labels text[] not null default '{}',
  archived_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete restrict,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activity_events (
  id bigserial primary key,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  board_id uuid references boards (id) on delete cascade,
  card_id uuid references cards (id) on delete cascade,
  actor_id uuid not null references auth.users (id) on delete restrict,
  kind text not null check (kind ~ '^[a-z_]{3,64}$'),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table card_presence (
  card_id uuid primary key references cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  editor_session text not null,
  cursor_range_start integer,
  cursor_range_end integer,
  last_seen timestamptz not null default now()
);

create index boards_workspace_idx on boards (workspace_id, position);
create index lists_board_idx on lists (board_id, position);
create index cards_list_idx on cards (list_id, position);
create index cards_assignees_idx on cards using gin (assignee_ids);
create index comments_card_idx on comments (card_id, created_at desc);
create index activity_workspace_idx on activity_events (workspace_id, id desc);
create index activity_board_idx on activity_events (board_id, id desc);
create index card_presence_seen_idx on card_presence (last_seen);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workspaces_set_updated_at
before update on workspaces
for each row execute function set_updated_at();

create trigger boards_set_updated_at
before update on boards
for each row execute function set_updated_at();

create trigger lists_set_updated_at
before update on lists
for each row execute function set_updated_at();

create trigger cards_set_updated_at
before update on cards
for each row execute function set_updated_at();

-- Bound only to the cards table. Writing branches for tables this function
-- is never attached to does not compile, because `new` has no fields from those
-- rows. Keep this function to the one record shape it is triggered with.
create or replace function log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity_events (workspace_id, board_id, card_id, actor_id, kind, payload)
  values (
    (select b.workspace_id from lists l
      join boards b on b.id = l.board_id
     where l.id = new.list_id),
    (select l.board_id from lists l where l.id = new.list_id),
    new.id,
    coalesce(new.created_by, auth.uid()),
    'created',
    to_jsonb(new) - 'created_at' - 'updated_at' - 'archived_at'
  );
  return new;
end;
$$;

create trigger cards_log_activity
after insert on cards
for each row execute function log_activity();

create or replace function claim_position(
  target_table text,
  target_id uuid,
  new_position integer,
  sibling_column text,
  id_column text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  shifting integer;
begin
  if new_position < 0 then
    raise exception 'position must be >= 0';
  end if;

  execute format(
    'update %I set %I = %I + 1 where %I = $1 and %I >= $2',
    target_table, sibling_column, sibling_column, id_column, sibling_column
  ) using target_id, new_position;
end;
$$;

create or replace function reorder_positions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_col text;
  parent_val uuid;
begin
  if tg_table_name = 'boards' then
    parent_col := 'workspace_id';
    parent_val := new.workspace_id;
  elsif tg_table_name = 'lists' then
    parent_col := 'board_id';
    parent_val := new.board_id;
  elsif tg_table_name = 'cards' then
    parent_col := 'list_id';
    parent_val := new.list_id;
  else
    parent_col := 'workspace_id';
    parent_val := new.workspace_id;
  end if;

  -- Compact gaps after a move/delete so positions stay contiguous per parent.
  execute format(
    'with ranked as (
       select id, row_number() over (order by position, created_at) - 1 as pos
       from %I where %I = $1
     )
     update %I t set position = r.pos
     from ranked r where t.id = r.id and t.position <> r.pos',
    tg_table_name, parent_col, tg_table_name
  ) using parent_val;

  if new.position > (
    select coalesce(max(position) + 1, 0) from boards
    where case when tg_table_name = 'boards' then workspace_id = parent_val end
  ) then
    -- placeholder, real per-table bound handled by callers if needed
    null;
  end if;

  return new;
end;
$$;

create or replace function card_order_trigger()
returns trigger
language plpgsql
as $$
begin
  perform reorder_positions();
  return null;
end;
$$;

create trigger boards_reorder_positions
after insert or update of position or delete on boards
for each row execute function reorder_positions();

create trigger lists_reorder_positions
after insert or update of position or delete on lists
for each row execute function reorder_positions();

create trigger cards_reorder_positions
after insert or update of position or delete on cards
for each row execute function reorder_positions();

create or replace function is_workspace_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = target and user_id = auth.uid()
  );
$$;

create or replace function workspace_role_of(target uuid)
returns workspace_role
language sql
stable
security definer
set search_path = public
as $$
  select role from workspace_members
  where workspace_id = target and user_id = auth.uid();
$$;

alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table boards enable row level security;
alter table lists enable row level security;
alter table cards enable row level security;
alter table comments enable row level security;
alter table activity_events enable row level security;
alter table card_presence enable row level security;

create policy workspaces_select on workspaces
  for select using (is_workspace_member(id));

create policy workspaces_insert on workspaces
  for insert with check (created_by = auth.uid());

create policy workspaces_update on workspaces
  for update using (workspace_role_of(id) in ('owner', 'admin'))
  with check (workspace_role_of(id) in ('owner', 'admin'));

create policy workspaces_delete on workspaces
  for delete using (workspace_role_of(id) = 'owner');

create policy workspace_members_select on workspace_members
  for select using (is_workspace_member(workspace_id));

create policy workspace_members_insert on workspace_members
  for insert with check (
    workspace_role_of(workspace_id) in ('owner', 'admin')
    or user_id = auth.uid()
  );

create policy workspace_members_update on workspace_members
  for update using (workspace_role_of(workspace_id) in ('owner', 'admin'))
  with check (workspace_role_of(workspace_id) in ('owner', 'admin'));

create policy workspace_members_delete on workspace_members
  for delete using (
    workspace_role_of(workspace_id) in ('owner', 'admin')
    or user_id = auth.uid()
  );

create policy boards_select on boards
  for select using (is_workspace_member(workspace_id));

create policy boards_insert on boards
  for insert with check (
    is_workspace_member(workspace_id)
    and workspace_role_of(workspace_id) in ('owner', 'admin', 'member')
  );

create policy boards_update on boards
  for update using (
    is_workspace_member(workspace_id)
    and workspace_role_of(workspace_id) in ('owner', 'admin', 'member')
  );

create policy boards_delete on boards
  for delete using (workspace_role_of(workspace_id) in ('owner', 'admin'));

create policy lists_select on lists
  for select using (
    exists (
      select 1 from boards b
      join workspace_members m on m.workspace_id = b.workspace_id
      where b.id = lists.board_id and m.user_id = auth.uid()
    )
  );

create policy lists_insert on lists
  for insert with check (
    exists (
      select 1 from boards b
      join workspace_members m on m.workspace_id = b.workspace_id
      where b.id = lists.board_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'member')
    )
  );

create policy lists_update on lists
  for update using (
    exists (
      select 1 from boards b
      join workspace_members m on m.workspace_id = b.workspace_id
      where b.id = lists.board_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'member')
    )
  );

create policy lists_delete on lists
  for delete using (
    exists (
      select 1 from boards b
      join workspace_members m on m.workspace_id = b.workspace_id
      where b.id = lists.board_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'member')
    )
  );

create policy cards_select on cards
  for select using (
    exists (
      select 1 from lists l
      join boards b on b.id = l.board_id
      join workspace_members m on m.workspace_id = b.workspace_id
      where l.id = cards.list_id and m.user_id = auth.uid()
    )
  );

create policy cards_insert on cards
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from lists l
      join boards b on b.id = l.board_id
      join workspace_members m on m.workspace_id = b.workspace_id
      where l.id = cards.list_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'member')
    )
  );

create policy cards_update on cards
  for update using (
    exists (
      select 1 from lists l
      join boards b on b.id = l.board_id
      join workspace_members m on m.workspace_id = b.workspace_id
      where l.id = cards.list_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'member')
    )
  );

create policy cards_delete on cards
  for delete using (
    exists (
      select 1 from lists l
      join boards b on b.id = l.board_id
      join workspace_members m on m.workspace_id = b.workspace_id
      where l.id = cards.list_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'member')
    )
  );

create policy comments_select on comments
  for select using (
    exists (
      select 1 from cards c
      join lists l on l.id = c.list_id
      join boards b on b.id = l.board_id
      join workspace_members m on m.workspace_id = b.workspace_id
      where c.id = comments.card_id and m.user_id = auth.uid()
    )
  );

create policy comments_insert on comments
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from cards c
      join lists l on l.id = c.list_id
      join boards b on b.id = l.board_id
      join workspace_members m on m.workspace_id = b.workspace_id
      where c.id = comments.card_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'member')
    )
  );

create policy comments_delete on comments
  for delete using (
    author_id = auth.uid()
    or exists (
      select 1 from cards c
      join lists l on l.id = c.list_id
      join boards b on b.id = l.board_id
      join workspace_members m on m.workspace_id = b.workspace_id
      where c.id = comments.card_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy activity_events_select on activity_events
  for select using (is_workspace_member(workspace_id));

create policy card_presence_select on card_presence
  for select using (
    exists (
      select 1 from cards c
      join lists l on l.id = c.list_id
      join boards b on b.id = l.board_id
      join workspace_members m on m.workspace_id = b.workspace_id
      where c.id = card_presence.card_id and m.user_id = auth.uid()
    )
  );

create policy card_presence_write on card_presence
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function prune_stale_presence()
returns void
language sql
security definer
set search_path = public
as $$
  delete from card_presence where last_seen < now() - interval '2 minutes';
$$;

comment on table cards is 'Card records. Position is per-list ordinal, rewritten by reorder_positions.';
