/* 데모 모드용 데이터 — 명단은 비어 있는 상태로 시작합니다.
   Supabase 를 연결하면 이 파일은 사용되지 않고, 실제 DB 데이터만 표시됩니다. */

const DEMO_DATA = {
  profiles: [
    { id: "demo-admin", email: "admin@demo.io", display_name: "새로", role: "admin" },
    { id: "demo-user", email: "user@demo.io", display_name: "일반 인원", role: "member" },
  ],
  members: [],
  personnel_changes: [],
  warnings: [],
  point_events: [],
};
