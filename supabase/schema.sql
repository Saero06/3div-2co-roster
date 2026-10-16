-- ============================================================
-- 제3사단 제2중대 명단 — Supabase 스키마
-- 사용법: Supabase 대시보드 → SQL Editor → 본 파일 전체 붙여넣기 → Run
-- ============================================================

-- ---------- 테이블 ----------

-- 사이트 계정 (auth.users 와 1:1)
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text not null,
  display_name text,
  role         text not null default 'pending'
               check (role in ('pending', 'member', 'admin', 'blocked')),
  created_at   timestamptz not null default now()
);

-- 중대 인원 (명단의 주체)
create table if not exists public.members (
  id           uuid primary key default gen_random_uuid(),
  roblox_nick  text not null,
  duty         text not null default '',        -- 직책
  rank         text not null default '',        -- 직위
  join_date    date not null,                   -- 전입일자 (근속일수는 이 값으로 자동 계산)
  status       text not null default 'active'
               check (status in ('active', 'leave', 'transferred', 'discharged')),
  leave_start  date,                            -- 휴가 시작일
  leave_end    date,                            -- 휴가 복귀 예정일
  leave_reason text not null default '',
  created_at   timestamptz not null default now()
);

-- 인사 변동 이력 (인사변동일자는 여기서 최신 기록을 표시)
create table if not exists public.personnel_changes (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members on delete cascade,
  change_type text not null,                    -- 전입 / 직위 변경 / 직책 변경 / 전출 / 퇴역
  detail      text not null default '',
  changed_at  timestamptz not null default now(),
  changed_by  uuid references public.profiles
);

-- 경고 (1·2·3 단계, 해제 가능)
create table if not exists public.warnings (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members on delete cascade,
  stage      int not null check (stage between 1 and 3),
  reason     text not null default '',
  given_at   timestamptz not null default now(),
  given_by  uuid references public.profiles,
  active     boolean not null default true
);

-- 실적 포인트 내역 (주간 집계의 원천 — 삭제하지 않고 누적)
create table if not exists public.point_events (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members on delete cascade,
  amount     int not null,                      -- 양수: 가점, 음수: 감점
  reason     text not null default '',
  event_at   timestamptz not null default now(),
  awarded_by uuid references public.profiles
);

-- ---------- 인덱스 ----------
create index if not exists idx_changes_member on public.personnel_changes (member_id, changed_at desc);
create index if not exists idx_warnings_member on public.warnings (member_id);
create index if not exists idx_points_member  on public.point_events (member_id, event_at desc);

-- ---------- 헬퍼 함수 ----------
-- 외부 API로 직접 호출되지 않도록 private 스키마에 둡니다.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
-- RLS 정책 안에서 무한 재귀를 피하기 위해 security definer 로 작성
create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function private.is_viewer()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'member')
  );
$$;

-- ---------- 회원가입 시 프로필 자동 생성 ----------
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  );
  return new;
end;
$$;

revoke execute on function private.is_admin() from public, anon;
revoke execute on function private.is_viewer() from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_viewer() to authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();

-- ---------- RLS (행 단위 보안) ----------
-- anon 키가 노출되어도, 아래 정책이 없으면 데이터에 접근할 수 없습니다.

alter table public.profiles          enable row level security;
alter table public.members           enable row level security;
alter table public.personnel_changes enable row level security;
alter table public.warnings          enable row level security;
alter table public.point_events     enable row level security;

-- profiles: 본인 자신은 항상 자기 행 읽기 가능 (역할 확인용)
create policy "profiles self read"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy "profiles admin read"
  on public.profiles for select to authenticated
  using (private.is_admin());

-- 관리자만 계정 권한 변경 (승인/거절/관리자 승격)
create policy "profiles admin update"
  on public.profiles for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- members: 승인된 인원(member/admin)만 조회, 관리자만 수정
create policy "members viewer read"
  on public.members for select to authenticated
  using (private.is_viewer());

create policy "members admin insert"
  on public.members for insert to authenticated
  with check (private.is_admin());

create policy "members admin update"
  on public.members for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "members admin delete"
  on public.members for delete to authenticated
  using (private.is_admin());

-- personnel_changes / warnings / point_events: 조회는 승인 인원, 쓰기는 관리자
create policy "changes viewer read"
  on public.personnel_changes for select to authenticated
  using (private.is_viewer());
create policy "changes admin insert"
  on public.personnel_changes for insert to authenticated
  with check (private.is_admin());

create policy "warnings viewer read"
  on public.warnings for select to authenticated
  using (private.is_viewer());
create policy "warnings admin insert"
  on public.warnings for insert to authenticated
  with check (private.is_admin());
create policy "warnings admin update"
  on public.warnings for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "points viewer read"
  on public.point_events for select to authenticated
  using (private.is_viewer());
create policy "points admin insert"
  on public.point_events for insert to authenticated
  with check (private.is_admin());

-- ---------- 관리자 이메일 등록 (이메일 인증 후 자동 승격) ----------
create table if not exists private.admin_emails (email text primary key);
revoke all on private.admin_emails from public, anon, authenticated;

create or replace function private.promote_confirmed_admin()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if new.email_confirmed_at is not null
     and exists (select 1 from private.admin_emails a where lower(a.email) = lower(new.email)) then
    update public.profiles set role = 'admin' where id = new.id and role <> 'admin';
  end if;
  return new;
end;
$$;
revoke execute on function private.promote_confirmed_admin() from public, anon, authenticated;

drop trigger if exists on_auth_user_verified on auth.users;
create trigger on_auth_user_verified
  after insert or update of email_confirmed_at on auth.users
  for each row execute procedure private.promote_confirmed_admin();

-- 관리자 추가: insert into private.admin_emails values ('이메일@주소');
-- 이미 가입·인증된 계정이라면: update public.profiles set role = 'admin' where email = '이메일@주소';
