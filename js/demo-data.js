/* 데모 모드용 샘플 데이터 — 실제 배포에서는 Supabase 데이터만 사용됩니다. */

const DEMO_DATA = {
  profiles: [
    { id: "demo-admin", email: "admin@demo.io", display_name: "짱구", role: "admin" },
    { id: "demo-user", email: "user@demo.io", display_name: "신입", role: "member" },
    { id: "demo-pending", email: "pending@demo.io", display_name: "대기자", role: "pending" },
  ],
  members: [
    { id: "m1", roblox_nick: "IronEagle_KR", duty: "부중대장", rank: "대위", join_date: "2024-11-03", status: "active" },
    { id: "m2", roblox_nick: "수류탄던진사람", duty: "1분대장", rank: "중사", join_date: "2025-02-14", status: "active" },
    { id: "m3", roblox_nick: "NightOwl_77", duty: "2분대장", rank: "하사", join_date: "2025-05-21", status: "active" },
    { id: "m4", roblox_nick: "김치찌개킬러", duty: "통신병", rank: "병장", join_date: "2025-07-02", status: "active" },
    { id: "m5", roblox_nick: "GhostRecon_9", duty: "저격수", rank: "상병", join_date: "2026-01-19", status: "active" },
    { id: "m6", roblox_nick: "탄약고지킴", duty: "탄약병", rank: "일병", join_date: "2026-03-08", status: "active" },
    { id: "m7", roblox_nick: "BosuKim_RBLX", duty: "위생병", rank: "일병", join_date: "2026-06-30", status: "active" },
    { id: "m8", roblox_nick: "초코파이사랑", duty: "일병", rank: "이병", join_date: "2026-09-01", status: "active" },
    { id: "m9", roblox_nick: "SilverFox_2", duty: "일병", rank: "이병", join_date: "2026-09-28", status: "active" },
    { id: "m10", roblox_nick: "OldSchool_Vet", duty: "예비역", rank: "병장", join_date: "2024-08-11", status: "transferred" },
  ],
  personnel_changes: [
    { id: "c1", member_id: "m1", change_type: "전입", detail: "제1사단에서 전입", changed_at: "2024-11-03T10:00:00+09:00", changed_by: "demo-admin" },
    { id: "c2", member_id: "m1", change_type: "직위 변경", detail: "중위 → 대위", changed_at: "2026-04-01T09:00:00+09:00", changed_by: "demo-admin" },
    { id: "c3", member_id: "m2", change_type: "전입", detail: "신규 입대", changed_at: "2025-02-14T10:00:00+09:00", changed_by: "demo-admin" },
    { id: "c4", member_id: "m5", change_type: "직책 변경", detail: "일병 → 저격수", changed_at: "2026-07-15T09:00:00+09:00", changed_by: "demo-admin" },
    { id: "c5", member_id: "m4", change_type: "직위 변경", detail: "상병 → 병장", changed_at: "2026-08-01T09:00:00+09:00", changed_by: "demo-admin" },
    { id: "c6", member_id: "m10", change_type: "전출", detail: "제7사단으로 전출", changed_at: "2026-05-20T09:00:00+09:00", changed_by: "demo-admin" },
  ],
  warnings: [
    { id: "w1", member_id: "m6", stage: 1, reason: "훈련 무단 이탈", given_at: "2026-09-10T21:00:00+09:00", given_by: "demo-admin", active: true },
    { id: "w2", member_id: "m7", stage: 2, reason: "경고 1 이후 재발: 집합 지각 3회", given_at: "2026-10-02T20:00:00+09:00", given_by: "demo-admin", active: true },
    { id: "w3", member_id: "m4", stage: 1, reason: "지각", given_at: "2026-08-20T20:00:00+09:00", given_by: "demo-admin", active: false },
  ],
  point_events: [],
};

/* 최근 4주간(한국시간 월요일 기준) 실적 샘플 생성 */
(function generateDemoPoints() {
  const DAY = 86400000;
  const now = Date.now();
  const amounts = {
    m1: [12, 8, 15, 6], m2: [9, 14, 7, 11], m3: [7, 5, 10, 8],
    m4: [15, 11, 13, 9], m5: [6, 9, 4, 7], m6: [3, -2, 5, 2],
    m7: [5, 4, 1, 3], m8: [4, 6, 3, 5], m9: [2, 3, 0, 4],
  };
  const reasons = ["작전 참여", "훈련 수료", "특별 임무", "관제 지원", "규정 위반 감점"];
  let id = 1;
  for (const [mid, weeks] of Object.entries(amounts)) {
    weeks.forEach((total, w) => {
      const weekAgo = 3 - w;
      const n = Math.max(1, Math.min(3, Math.round(Math.abs(total) / 4) + 1));
      let remaining = total;
      for (let i = 0; i < n; i++) {
        const isLast = i === n - 1;
        const amt = isLast ? remaining : Math.round(remaining / (n - i));
        remaining -= amt;
        const at = now - weekAgo * 7 * DAY - Math.floor(Math.random() * 5) * DAY - 6 * 3600000;
        DEMO_DATA.point_events.push({
          id: "p" + id++,
          member_id: mid,
          amount: amt,
          reason: amt < 0 ? reasons[4] : reasons[Math.floor(Math.random() * 4)],
          event_at: new Date(at).toISOString(),
          awarded_by: "demo-admin",
        });
      }
    });
  }
})();
