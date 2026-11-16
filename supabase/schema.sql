-- =====================================================
-- 習慣管理システム 第1段階：習慣と完了記録
-- Supabase の SQL Editor に貼り付けて「Run」してください
-- =====================================================

-- 習慣マスタ
create table public.habits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 100),
  -- work=仕事・経営 / health=健康・美容 / growth=自己成長 / private=人間関係・プライベート / life=睡眠・生活 / other=その他
  category        text not null default 'other'
                  check (category in ('work','health','growth','private','life','other')),
  -- 実施する曜日（0=日 … 6=土）
  target_weekdays smallint[] not null default '{0,1,2,3,4,5,6}',
  sort_order      int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  archived_at     timestamptz            -- 終了した日時（履歴は残す）
);

-- 習慣の完了記録（※所要時間は持たない。時間記録は第4段階で別テーブルにする）
create table public.habit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id    uuid not null references public.habits(id) on delete cascade,
  log_date    date not null,
  status      text not null default 'done' check (status in ('done','skipped')),
  source      text not null default 'web'  check (source in ('web','line')),
  note        text,
  created_at  timestamptz not null default now(),
  unique (habit_id, log_date)
);

create index habit_logs_user_date_idx on public.habit_logs (user_id, log_date);

-- 行レベルセキュリティ：ログインした本人のデータだけ読み書きできる
alter table public.habits     enable row level security;
alter table public.habit_logs enable row level security;

create policy "own habits" on public.habits
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "own habit logs" on public.habit_logs
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );
