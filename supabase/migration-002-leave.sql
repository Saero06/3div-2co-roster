-- ============================================================
-- [업데이트] 휴가 기능 추가
-- schema.sql 을 '이 업데이트 이전에' 이미 실행했다면 이 파일만 SQL Editor 에서 실행하세요.
-- 처음 설치하는 경우에는 schema.sql 에 이미 포함되어 있으므로 실행할 필요가 없습니다.
-- ============================================================

alter table public.members add column if not exists leave_start  date;
alter table public.members add column if not exists leave_end    date;
alter table public.members add column if not exists leave_reason text not null default '';

alter table public.members drop constraint if exists members_status_check;
alter table public.members add constraint members_status_check
  check (status in ('active', 'leave', 'transferred', 'discharged'));
