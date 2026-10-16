# 제3사단 제2중대 — 인원 명단 사이트

직책 · 직위 · 로블록스 닉 · 전입일자 · 근속일수 · 인사변동일자 · 경고 1/2/3 · 주간 실적포인트를 관리하는
**승인 인원 전용** 명단 사이트입니다.

- **호스팅**: GitHub Pages (무료, 정적 사이트)
- **로그인 / 데이터베이스**: Supabase (무료, RLS 행 단위 보안)
- **데이터와 변경 이력은 Supabase DB에 저장**되므로, GitHub 저장소가 공개되어도 명단 정보는 노출되지 않습니다.

---

## 1. Supabase 프로젝트 만들기

1. [supabase.com](https://supabase.com) 에서 무료 계정 생성 → **New Project**
2. 프로젝트 이름은 아무거나 (예: `roster-3div-2co`) — 지역은 `Northeast Asia (Seoul)` 권장
3. 프로젝트가 만들어지면 **Project Settings → API**에서 두 값을 복사해 둡니다.
   - `Project URL`
   - `anon public` 키

> **주의**: `service_role` 키는 절대 사이트에 넣지 마세요. 서버 없이 동작하는 이 사이트에서는
> `anon` 키만 사용하며, `anon` 키가 노출되어도 아래 RLS 정책이 데이터를 지켜줍니다.

## 2. 데이터베이스 초기화

1. Supabase 대시보드 → **SQL Editor** → `New query`
2. `supabase/schema.sql` 파일 내용을 전부 붙여넣고 **Run**
3. 테이블 5개(`profiles`, `members`, `personnel_changes`, `warnings`, `point_events`)와
   보안 정책(RLS)이 자동으로 만들어집니다.

## 3. 로그인 설정

- **Authentication → Providers → Email** 은 기본으로 켜져 있습니다. (그대로 사용)
- **Authentication → URL Configuration → Site URL** 에 본인 사이트 주소를 넣고,
  **Redirect URLs** 에도 같은 주소를 추가하세요.
  (예: `https://본인계정.github.io/저장소이름/`) — 이메일 확인 링크가 이 주소로 돌아옵니다.
- 이메일 확인 메일이 번거롭다면 **Authentication → Providers → Email → Confirm email** 을 끌 수 있지만,
  켜 두는 편이 가짜 가입을 막을 수 있어 더 안전합니다.

## 4. 사이트에 키 연결

`js/config.js` 를 열어 복사해 둔 두 값을 넣습니다.

```js
const SUPABASE_URL = "https://abcdefgh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

값이 비어 있으면 사이트는 자동으로 **데모 모드**(샘플 데이터)로 동작합니다.

## 5. GitHub에 올리고 사이트 열기

```bash
git add .
git commit -m "명단 사이트 초기 버전"
git push origin main
```

1. GitHub 저장소 → **Settings → Pages**
2. Source: `Deploy from a branch` / Branch: `main` / 폴더: `/ (root)` → Save
3. 1~2분 뒤 `https://본인계정.github.io/저장소이름/` 으로 접속

> 무료 개인 계정에서는 GitHub Pages 사이트가 공개됩니다.
> 하지만 이 사이트는 **데이터 전체가 Supabase에 있고 로그인해야만** 열리므로,
> 코드가 공개되어도 명단은 보호됩니다. 코드 자체를 감추고 싶다면 GitHub Pro에서
> 비공개 저장소의 Pages를 사용하면 됩니다.

## 6. 첫 관리자 지정 (중요)

1. 사이트에서 **신규 가입 신청**으로 본인 계정을 만듭니다. (자동으로 '승인 대기' 상태)
2. Supabase → **SQL Editor** 에서 아래 실행 (이메일은 본인 것으로):

```sql
update public.profiles set role = 'admin' where email = 'your@email.com';
```

3. 사이트를 새로고침하면 관리자 화면이 열립니다.

이후 가입자는 모두 '승인 대기' 상태가 되고, 관리 페이지에서 승인/거절합니다.

## 운영 규칙

- **근속일수**: 전입 당일을 1일로 계산해 자동 표시 (직접 수정하지 않음)
- **인사변동일자**: 직위·직책을 수정하면 이력이 자동 기록되고, 최신 이력 날짜가 표시됩니다
- **경고**: 1 → 2 → 3 단계로 부여하며 사유·날짜가 기록되고, 해제할 수 있습니다
- **실적포인트**: 매주 **한국시간 월요일 00시**를 기준으로 주간 합계를 자동 집계합니다.
  이번 주와 지난 주 실적을 모두 확인할 수 있고, 감점(음수)도 기록 가능합니다

## 휴가 · 전출 · 삭제

인원을 클릭해 상세 창을 열면 맨 아래 **관리** 칸에 버튼이 있습니다. 관리자만 보입니다.

| 버튼 | 결과 | 기록 |
|---|---|---|
| 휴가 처리 | 시작일·복귀 예정일·사유를 입력합니다. '재직' 목록에 남고 이름 옆에 `휴가 ~MM/DD`가 붙습니다. 복귀일이 지나면 `휴가 만료`로 바뀝니다 | 인사 이력에 남음 |
| 휴가 복귀 | 다시 재직 상태로 돌립니다 | 인사 이력에 남음 |
| 전출 처리 / 복직 처리 | 명단에서 빼거나 다시 넣습니다 | 인사 이력에 남음 |
| 인원 삭제 | 닉네임을 정확히 입력해야 실행됩니다. 실적·경고·인사 이력까지 **모두 영구 삭제**됩니다 | 남지 않음 |

> **이미 schema.sql 을 실행했다면** `supabase/migration-002-leave.sql` 을 SQL Editor 에서 한 번 실행해야 휴가 기능이 동작합니다.

## 보안 요약

| 위협 | 대응 |
|---|---|
| 사이트 코드를 열어 데이터 훔치기 | 데이터는 Supabase DB에 있음 — 코드에 명단 없음 |
| anon 키 탈취 후 DB 직접 접근 | RLS 정책: 로그인+승인된 사용자만 조회, 관리자만 쓰기 |
| 마음대로 가입해서 명단 열람 | 가입 즉시 '승인 대기', 관리자 승인 전엔 아무것도 볼 수 없음 |
| 기록 조작 은폐 | 실적·경고 부여·인사 변경 내역에 처리자와 시각이 남아 이력 추적 가능 |
