/* ============================================================
   제3사단 제2중대 명단 — 애플리케이션
   구조: 정적 SPA (GitHub Pages 배포) + Supabase(인증·DB·RLS)
   ============================================================ */

"use strict";

/* ---------- 유틸 ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const ESC_MAP = {};
ESC_MAP[String.fromCharCode(38)] = String.fromCharCode(38) + "amp;";
ESC_MAP[String.fromCharCode(60)] = String.fromCharCode(38) + "lt;";
ESC_MAP[String.fromCharCode(62)] = String.fromCharCode(38) + "gt;";
ESC_MAP[String.fromCharCode(34)] = String.fromCharCode(38) + "quot;";
ESC_MAP[String.fromCharCode(39)] = String.fromCharCode(38) + "#39;";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);

const DAY = 86400000;
const KST_OFFSET = 9 * 3600000;

function kstParts(ms) {
  const d = new Date(ms + KST_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
}
function kstDateStr(ms) {
  const p = kstParts(ms);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
/* 한국시간 기준, 월요일 00:00 (주 단위 실적 집계 기준점) */
function weekStartUTC(ms) {
  const p = kstParts(ms);
  const dayStart = Date.UTC(p.y, p.m, p.d) - KST_OFFSET;
  return dayStart - ((p.dow + 6) % 7) * DAY;
}
function serviceDays(joinDate) {
  const joinMs = Date.parse(joinDate + "T00:00:00+09:00");
  if (isNaN(joinMs)) return null;
  const p = kstParts(Date.now());
  const todayMs = Date.UTC(p.y, p.m, p.d) - KST_OFFSET;
  return Math.max(0, Math.floor((todayMs - joinMs) / DAY) + 1); // 전입 당일 = 1일
}
function fmtDate(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 10);
}
/* 타임스탬프(UTC 저장)는 한국시간 날짜로 변환해 표시 */
function fmtKstDate(iso) {
  const ms = Date.parse(iso);
  if (!iso || isNaN(ms)) return "—";
  return kstDateStr(ms);
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return kstDateStr(d.getTime()) + " " + String(kstParts(d.getTime()).d).padStart(2, "0") + ":00".slice(0) + " " + kstHour(d);
}
function kstHour(d) {
  const h = new Date(d.getTime() + KST_OFFSET).getUTCHours();
  return String(h).padStart(2, "0") + "시";
}

function toast(msg, type = "") {
  const root = $("#toast-root");
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* 직위 서열 (정렬용) */
const RANK_ORDER = ["대위", "중위", "소위", "준위", "원사", "상사", "중사", "하사", "병장", "상병", "일병", "이등병", "이병"];
const rankIdx = (r) => {
  const i = RANK_ORDER.indexOf(r);
  return i === -1 ? 99 : i;
};

/* ---------- 상태 ---------- */

const S = {
  demo: !SUPABASE_URL || !SUPABASE_ANON_KEY,
  sb: null,
  profile: null, // { id, email, display_name, role }
  members: [],
  warnings: [],
  points: [],
  changes: [],
  profiles: [],
  sort: { key: "rank", dir: 1 },
  filter: { q: "", status: "active" },
};

const isAdmin = () => S.profile?.role === "admin";

/* ---------- 테마 (네이비 / 화이트) ---------- */
let THEME = "navy"; // 기본 네이비 테마
document.documentElement.setAttribute("data-theme", THEME);
function themeButton(extraClass = "") {
  const next = THEME === "navy" ? "white" : "navy";
  return `<button class="btn-theme ${extraClass}" id="btn-theme" data-testid="button-theme" aria-label="${next === "white" ? "화이트" : "네이비"} 테마로 변경">
    <span class="sw" style="background:${next === "white" ? "#ffffff" : "#101b32"}"></span>${next === "white" ? "화이트" : "네이비"}
  </button>`;
}
function bindThemeButton() {
  const b = document.getElementById("btn-theme");
  if (!b) return;
  b.onclick = () => {
    THEME = THEME === "navy" ? "white" : "navy";
    document.documentElement.setAttribute("data-theme", THEME);
    route();
  };
}
const LOGO = `<img class="unit-logo" src="img/logo.png" alt="제3보병사단 로고" width="160" height="160" />`;

/* ============================================================
   데이터 어댑터 — Supabase / 데모
   ============================================================ */

const SupaDB = {
  async init() {
    S.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    S.sb.auth.onAuthStateChange((_e, session) => {
      if (!session) { S.profile = null; route(); }
    });
    const { data } = await S.sb.auth.getSession();
    if (data?.session) await this.loadProfile(data.session.user.id);
  },
  async loadProfile(userId) {
    const { data, error } = await S.sb.from("profiles").select().eq("id", userId).single();
    if (error || !data) { S.profile = { id: userId, role: "pending", email: "", display_name: "" }; return; }
    S.profile = data;
  },
  async signIn(email, password) {
    const { error } = await S.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const { data } = await S.sb.auth.getUser();
    await this.loadProfile(data.user.id);
  },
  async signUp(email, password, displayName) {
    const { data, error } = await S.sb.auth.signUp({
      email, password,
      options: { data: { display_name: displayName } },
    });
    if (error) throw new Error(error.message);
    if (data.session) {
      await this.loadProfile(data.session.user.id); // 이메일 확인이 꺼진 구성: 즉시 로그인됨
      return "ok";
    }
    return "confirm"; // 이메일 확인 필요
  },
  async signOut() {
    await S.sb.auth.signOut();
    S.profile = null;
  },
  async fetchAll() {
    const [mem, warn, pts, chg, prf] = await Promise.all([
      S.sb.from("members").select("*"),
      S.sb.from("warnings").select("*"),
      S.sb.from("point_events").select("*"),
      S.sb.from("personnel_changes").select("*"),
      isAdmin() ? S.sb.from("profiles").select("*") : Promise.resolve({ data: null }),
    ]);
    S.members = mem.data || [];
    S.warnings = warn.data || [];
    S.points = pts.data || [];
    S.changes = chg.data || [];
    S.profiles = prf.data || [];
  },
  async addMember(m) {
    const { data, error } = await S.sb.from("members").insert(m).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
  async updateMember(id, patch) {
    const { data, error } = await S.sb.from("members").update(patch).eq("id", id).select("id").single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("수정 실패: 대상을 찾을 수 없습니다.");
  },
  async addWarning(w) {
    const { error } = await S.sb.from("warnings").insert(w);
    if (error) throw new Error(error.message);
  },
  async resolveWarning(id) {
    const { data, error } = await S.sb.from("warnings").update({ active: false }).eq("id", id).select("id").single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("해제 실패: 대상을 찾을 수 없습니다.");
  },
  async addPoint(e) {
    const { error } = await S.sb.from("point_events").insert(e);
    if (error) throw new Error(error.message);
  },
  async addChange(c) {
    const { error } = await S.sb.from("personnel_changes").insert(c);
    if (error) throw new Error(error.message);
  },
  async setUserRole(id, role) {
    const { data, error } = await S.sb.from("profiles").update({ role }).eq("id", id).select("id").single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("권한 변경 실패: 대상을 찾을 수 없습니다.");
  },
};

let demoLoaded = false;

const DemoDB = {
  async init() { /* 데모 모드: 로그인 없음 */ },
  async signIn() { throw new Error("데모 모드에서는 이메일 로그인이 제공되지 않습니다."); },
  async signUp() { throw new Error("데모 모드에서는 가입이 제공되지 않습니다."); },
  async signOut() { S.profile = null; },
  async fetchAll() {
    if (demoLoaded) return; // 세션 동안 데모 수정 사항 유지
    S.members = DEMO_DATA.members.map((m) => ({ ...m }));
    S.warnings = DEMO_DATA.warnings.map((w) => ({ ...w }));
    S.points = DEMO_DATA.point_events.map((p) => ({ ...p }));
    S.changes = DEMO_DATA.personnel_changes.map((c) => ({ ...c }));
    S.profiles = DEMO_DATA.profiles.map((p) => ({ ...p }));
    demoLoaded = true;
  },
  async addMember(m) {
    const row = { id: "dm" + Date.now(), status: "active", ...m };
    S.members.push(row);
    return row;
  },
  async updateMember(id, patch) {
    const row = S.members.find((m) => m.id === id);
    if (row) Object.assign(row, patch);
  },
  async addWarning(w) { S.warnings.push({ id: "dw" + Date.now(), active: true, ...w }); },
  async resolveWarning(id) {
    const w = S.warnings.find((x) => x.id === id);
    if (w) w.active = false;
  },
  async addPoint(e) { S.points.push({ id: "dp" + Date.now(), ...e }); },
  async addChange(c) { S.changes.push({ id: "dc" + Date.now(), ...c }); },
  async setUserRole(id, role) {
    const p = S.profiles.find((x) => x.id === id);
    if (p) p.role = role;
  },
};

const DB = S.demo ? DemoDB : SupaDB;

/* ---------- 파생 데이터 ---------- */

function activeWarning(memberId) {
  const list = S.warnings.filter((w) => w.member_id === memberId && w.active);
  return list.length ? Math.max(...list.map((w) => w.stage)) : 0;
}
function weekPoints(memberId, ws) {
  return S.points
    .filter((p) => p.member_id === memberId && Date.parse(p.event_at) >= ws && Date.parse(p.event_at) < ws + 7 * DAY)
    .reduce((sum, p) => sum + p.amount, 0);
}
function lastChange(memberId) {
  const list = S.changes.filter((c) => c.member_id === memberId).sort((a, b) => Date.parse(b.changed_at) - Date.parse(a.changed_at));
  return list[0] || null;
}

/* ============================================================
   라우팅
   ============================================================ */

function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  if (!S.profile) { renderAuth(); return; }
  if (S.profile.role === "pending") { renderWaiting(); return; }
  if (S.profile.role === "blocked") { renderBlocked(); return; }
  if (hash === "admin" && isAdmin()) { renderAdmin(); return; }
  renderRoster();
}

window.addEventListener("hashchange", route);

/* ============================================================
   로그인 화면
   ============================================================ */

function renderAuth() {
  let mode = "login";
  const app = $("#app");

  function draw() {
    app.innerHTML = `
      <div class="auth-wrap">
        ${themeButton("auth-theme")}
        <div class="auth-card" data-testid="auth-card">
          ${LOGO}
          <h1>제3사단 제2중대<br />인원 현황</h1>
          <p class="desc">승인된 인원만 접근할 수 있는 내부 명단입니다.</p>
          ${
            S.demo
              ? `<div class="auth-note">데모 모드입니다 — 실제 Supabase 연결 전 샘플 데이터로 화면을 보여드립니다.</div>
                 <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px;">
                   <button class="btn full" id="demo-admin-btn" data-testid="button-demo-admin">관리자로 데모 둘러보기</button>
                   <button class="btn ghost full" id="demo-member-btn" data-testid="button-demo-member">일반 인원으로 보기</button>
                 </div>`
              : `
          <div class="auth-tabs" role="tablist">
            <button id="tab-login" class="${mode === "login" ? "active" : ""}" data-testid="tab-login">로그인</button>
            <button id="tab-signup" class="${mode === "signup" ? "active" : ""}" data-testid="tab-signup">신규 가입 신청</button>
          </div>
          <form class="auth-form" id="auth-form">
            <div class="field">
              <label for="auth-email">이메일</label>
              <input id="auth-email" type="email" autocomplete="email" required data-testid="input-email" />
            </div>
            <div class="field">
              <label for="auth-pw">비밀번호</label>
              <input id="auth-pw" type="password" autocomplete="current-password" minlength="6" required data-testid="input-password" />
            </div>
            ${mode === "signup" ? `
            <div class="field">
              <label for="auth-name">표시 이름 (실명 또는 별명)</label>
              <input id="auth-name" type="text" maxlength="30" data-testid="input-name" />
              <p class="hint">가입 후 관리자 승인 전까지 명단 조회가 제한됩니다.</p>
            </div>` : ""}
            <button class="btn full" type="submit" data-testid="button-submit">
              ${mode === "login" ? "로그인" : "가입 신청"}
            </button>
          </form>`
          }
        </div>
      </div>`;

    bindThemeButton();
    if (S.demo) {
      $("#demo-admin-btn").onclick = async () => {
        S.profile = { ...DEMO_DATA.profiles[0] };
        await refresh();
      };
      $("#demo-member-btn").onclick = async () => {
        S.profile = { ...DEMO_DATA.profiles[1] };
        await refresh();
      };
      return;
    }

    $("#tab-login").onclick = () => { mode = "login"; draw(); };
    $("#tab-signup").onclick = () => { mode = "signup"; draw(); };
    $("#auth-form").onsubmit = async (e) => {
      e.preventDefault();
      const email = $("#auth-email").value.trim();
      const pw = $("#auth-pw").value;
      try {
        if (mode === "login") {
          await DB.signIn(email, pw);
          await refresh();
        } else {
          const name = $("#auth-name")?.value.trim() || email.split("@")[0];
          const res = await DB.signUp(email, pw, name);
          if (res === "confirm") {
            toast("가입 신청 완료 — 이메일을 확인해 주세요.", "ok");
            mode = "login"; draw();
          } else {
            toast("가입 신청 완료", "ok");
            await refresh();
          }
        }
      } catch (err) {
        toast(err.message, "err");
      }
    };
  }
  draw();
}

function renderWaiting() {
  $("#app").innerHTML = `
    <div class="auth-wrap"><div class="wait-wrap">
      <div style="display:flex;justify-content:center;margin-bottom:16px;">${LOGO.replace('unit-logo', 'unit-logo" style="width:88px;height:88px')}</div>
      <h1>승인 대기 중</h1>
      <p>가입이 확인되었습니다. 관리자가 승인하면 명단에 접근할 수 있습니다.<br />중대 인사 담당자에게 문의해 주세요.</p>
      <div style="margin-top:24px;"><button class="btn ghost" id="wait-logout">로그아웃</button></div>
    </div></div>`;
  $("#wait-logout").onclick = async () => { await DB.signOut(); route(); };
}

function renderBlocked() {
  $("#app").innerHTML = `
    <div class="auth-wrap"><div class="wait-wrap">
      <div style="display:flex;justify-content:center;margin-bottom:16px;">${LOGO.replace('unit-logo', 'unit-logo" style="width:88px;height:88px')}</div>
      <h1>접근이 제한되었습니다</h1>
      <p>해당 계정은 접근 권한이 없습니다. 관리자에게 문의해 주세요.</p>
      <div style="margin-top:24px;"><button class="btn ghost" id="wait-logout">로그아웃</button></div>
    </div></div>`;
  $("#wait-logout").onclick = async () => { await DB.signOut(); route(); };
}

/* ============================================================
   상단 바
   ============================================================ */

function renderTopbar(active) {
  const nav = [
    { href: "#/roster", label: "명단", testid: "link-roster" },
    ...(isAdmin() ? [{ href: "#/admin", label: "관리", testid: "link-admin" }] : []),
  ];
  return `
    <header class="topbar">
      <div class="unit-mark">
        ${LOGO}
        <div>
          제3사단 제2중대
          <span class="sub">3RD INFANTRY DIVISION</span>
        </div>
      </div>
      <nav>
        ${nav.map((n) => `<a class="nav-link ${active === n.href ? "active" : ""}" href="${n.href}" data-testid="${n.testid}">${n.label}</a>`).join("")}
        <div class="user-chip"><span class="name">${esc(S.profile.display_name || S.profile.email)}</span><span class="role">· ${isAdmin() ? "관리자" : "인원"}</span></div>
        ${themeButton()}
        <button class="btn-logout" id="btn-logout" data-testid="button-logout">로그아웃</button>
      </nav>
    </header>`;
}

function bindTopbar() {
  bindThemeButton();
  $("#btn-logout").onclick = async () => { await DB.signOut(); route(); };
}

async function refresh() {
  await DB.fetchAll();
  route();
}

/* ============================================================
   명단 페이지
   ============================================================ */

const SORTABLE = {
  rank: (m) => rankIdx(m.rank),
  nick: (m) => m.roblox_nick,
  join_date: (m) => m.join_date,
  service: (m) => -(serviceDays(m.join_date) ?? 0),
  change: (m) => -(lastChange(m.id)?.changed_at ? Date.parse(lastChange(m.id).changed_at) : 0),
  warn: (m) => -activeWarning(m.id),
  points: (m) => -weekPoints(m.id, weekStartUTC(Date.now())),
};

function renderRoster() {
  const searchWasFocused = document.activeElement?.id === "search";
  const selStart = document.activeElement?.id === "search" ? document.activeElement.selectionStart : null;
  const ws = weekStartUTC(Date.now());
  const isAdminUser = isAdmin();

  const rows = S.members
    .filter((m) => (S.filter.status === "all" ? true : m.status === S.filter.status))
    .filter((m) => !S.filter.q || m.roblox_nick.toLowerCase().includes(S.filter.q.toLowerCase()))
    .sort((a, b) => {
      const f = SORTABLE[S.sort.key];
      const va = f(a), vb = f(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb, "ko") : (va > vb ? 1 : va < vb ? -1 : 0);
      return cmp * S.sort.dir;
    });

  const activeCount = S.members.filter((m) => m.status === "active").length;
  const weekTotal = S.members.filter((m) => m.status === "active").reduce((s, m) => s + weekPoints(m.id, ws), 0);
  const warnedCount = S.members.filter((m) => m.status === "active" && activeWarning(m.id) > 0).length;
  const newCount = S.members.filter((m) => {
    const d = serviceDays(m.join_date);
    return m.status === "active" && d !== null && d <= 30;
  }).length;

  $("#app").innerHTML = `
    ${renderTopbar("#/roster")}
    ${S.demo ? `<div class="demo-banner">데모 모드 — 샘플 데이터가 표시되고 있습니다.</div>` : ""}
    <main class="page">
      <div class="page-head">
        <div>
          <h1>인원 명단</h1>
          <p class="sub">실적포인트는 한국시간 월요일 00시를 기준으로 한 주 단위 집계입니다.</p>
        </div>
        <div class="actions">
          <input id="search" type="search" placeholder="닉네임 검색" value="${esc(S.filter.q)}" style="padding:10px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);" data-testid="input-search" />
          <select id="status-filter" style="padding:10px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);" data-testid="select-status">
            <option value="active" ${S.filter.status === "active" ? "selected" : ""}>재직</option>
            <option value="transferred" ${S.filter.status === "transferred" ? "selected" : ""}>전출</option>
            <option value="all" ${S.filter.status === "all" ? "selected" : ""}>전체</option>
          </select>
          ${isAdminUser ? `<button class="btn" id="btn-add-member" data-testid="button-add-member">인원 추가</button>` : ""}
        </div>
      </div>

      <div class="stat-row">
        <div class="stat"><div class="label">재직 인원</div><div class="value">${activeCount}</div></div>
        <div class="stat"><div class="label">이번 주 실적 합계</div><div class="value ${weekTotal >= 0 ? "pos" : "neg"}">${weekTotal >= 0 ? "+" : ""}${weekTotal}p</div></div>
        <div class="stat"><div class="label">경고 대상</div><div class="value ${warnedCount ? "neg" : ""}">${warnedCount}명</div></div>
        <div class="stat"><div class="label">신규 전입 (30일)</div><div class="value">${newCount}명</div></div>
      </div>

      <div class="table-card">
        <div class="table-scroll">
          <table class="roster">
            <thead><tr>
              <th>직책</th>
              <th class="${S.sort.key === "rank" ? "sorted " + (S.sort.dir === 1 ? "asc" : "") : ""}" data-sort="rank">직위</th>
              <th class="${S.sort.key === "nick" ? "sorted " + (S.sort.dir === 1 ? "asc" : "") : ""}" data-sort="nick">로블록스 닉</th>
              <th class="${S.sort.key === "join_date" ? "sorted " + (S.sort.dir === 1 ? "asc" : "") : ""}" data-sort="join_date">전입일자</th>
              <th class="${S.sort.key === "service" ? "sorted " + (S.sort.dir === 1 ? "asc" : "") : ""}" data-sort="service">근속일수</th>
              <th class="${S.sort.key === "change" ? "sorted " + (S.sort.dir === 1 ? "asc" : "") : ""}" data-sort="change">인사변동일자</th>
              <th class="${S.sort.key === "warn" ? "sorted " + (S.sort.dir === 1 ? "asc" : "") : ""}" data-sort="warn">경고</th>
              <th class="${S.sort.key === "points" ? "sorted " + (S.sort.dir === 1 ? "asc" : "") : ""}" data-sort="points">이번 주 실적</th>
            </tr></thead>
            <tbody>
              ${rows.length ? rows.map((m) => rosterRow(m, ws)).join("") : `
                <tr><td colspan="8"><div class="empty-state"><div class="big">인원이 없습니다</div>조건을 바꾸거나 인원을 추가해 보세요.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </main>`;

  $("#search").oninput = (e) => { S.filter.q = e.target.value; renderRoster(); };
  if (searchWasFocused) {
    const el = $("#search");
    el.focus();
    if (selStart !== null) el.setSelectionRange(selStart, selStart);
  }
  $("#status-filter").onchange = (e) => { S.filter.status = e.target.value; renderRoster(); };
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.sort;
      if (S.sort.key === key) S.sort.dir *= -1;
      else S.sort = { key, dir: 1 };
      renderRoster();
    };
  });
  document.querySelectorAll("tr[data-member]").forEach((tr) => {
    tr.onclick = () => openMemberModal(tr.dataset.member);
  });
  const addBtn = $("#btn-add-member");
  if (addBtn) addBtn.onclick = () => openMemberForm(null);
  bindTopbar();
}

function rosterRow(m, ws) {
  const warn = activeWarning(m.id);
  const pts = weekPoints(m.id, ws);
  const lc = lastChange(m.id);
  const sd = serviceDays(m.join_date);
  const warnChip =
    warn === 0
      ? `<span class="chip none">없음</span>`
      : `<span class="chip warn-${warn}">${"●".repeat(warn)} 경고 ${warn}</span>`;
  return `
    <tr data-member="${m.id}" data-testid="row-member-${esc(m.roblox_nick)}">
      <td>${m.duty ? `<span class="chip duty">${esc(m.duty)}</span>` : `<span class="chip none">—</span>`}</td>
      <td><span class="chip rank">${esc(m.rank || "미정")}</span></td>
      <td><span class="member-name"><span class="avatar">${esc((m.roblox_nick || "?")[0])}</span>${esc(m.roblox_nick)}${m.status !== "active" ? ` <span class="chip none">${m.status === "transferred" ? "전출" : "퇴역"}</span>` : ""}</span></td>
      <td class="mono">${esc(fmtDate(m.join_date))}</td>
      <td class="mono">${sd ?? "—"}일</td>
      <td class="mono">${lc ? esc(fmtKstDate(lc.changed_at)) : "—"}</td>
      <td>${warnChip}</td>
      <td><span class="chip pts ${pts > 0 ? "pos" : pts < 0 ? "neg" : ""}">${pts > 0 ? "+" : ""}${pts}p</span></td>
    </tr>`;
}

/* ============================================================
   인원 상세 모달
   ============================================================ */

function openModal(html) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = html;
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeModal(); });
  $("#modal-root").appendChild(overlay);
  const escHandler = (e) => { if (e.key === "Escape") closeModal(); };
  document.addEventListener("keydown", escHandler, { once: true });
  document.querySelectorAll("#modal-root [data-close]").forEach((b) => (b.onclick = closeModal));
  return overlay;
}
function closeModal() { $("#modal-root").innerHTML = ""; }

let modalWeekOffset = 0;

function openMemberModal(id) {
  modalWeekOffset = 0;
  drawMemberModal(id);
}

function drawMemberModal(id) {
  const m = S.members.find((x) => x.id === id);
  if (!m) { closeModal(); return; }
  const warn = activeWarning(m.id);
  const sd = serviceDays(m.join_date);
  const changes = S.changes.filter((c) => c.member_id === id).sort((a, b) => Date.parse(b.changed_at) - Date.parse(a.changed_at));
  const warns = S.warnings.filter((w) => w.member_id === id).sort((a, b) => Date.parse(b.given_at) - Date.parse(a.given_at));
  const admin = isAdmin();

  /* 주간 실적 — 한국시간 월요일 기준 최근 5주 */
  const weekList = [];
  for (let i = 0; i < 5; i++) {
    const ws = weekStartUTC(Date.now()) - i * 7 * DAY;
    weekList.push({ ws, label: i === 0 ? "이번 주" : kstDateStr(ws).slice(5).replace("-", "/") });
  }
  const selWeek = weekList[modalWeekOffset];
  const weekEvents = S.points
    .filter((p) => p.member_id === id && Date.parse(p.event_at) >= selWeek.ws && Date.parse(p.event_at) < selWeek.ws + 7 * DAY)
    .sort((a, b) => Date.parse(b.event_at) - Date.parse(a.event_at));
  const weekSum = weekEvents.reduce((s, p) => s + p.amount, 0);

  openModal(`
    <div class="modal" role="dialog" aria-label="${esc(m.roblox_nick)} 상세">
      <div class="modal-head">
        <div class="unit-badge">${esc((m.roblox_nick || "?")[0])}</div>
        <h2>${esc(m.roblox_nick)}${m.status !== "active" ? ` <span class="chip none">${m.status === "transferred" ? "전출" : "퇴역"}</span>` : ""}</h2>
        <button class="btn-close" data-close aria-label="닫기">✕</button>
      </div>
      <div class="modal-body">
        <div class="sect">
          <h3>기본 정보</h3>
          <div class="kv-grid">
            <div class="kv"><div class="k">직책</div><div class="v">${m.duty ? esc(m.duty) : "—"}</div></div>
            <div class="kv"><div class="k">직위</div><div class="v">${m.rank ? esc(m.rank) : "—"}</div></div>
            <div class="kv"><div class="k">전입일자</div><div class="v mono">${esc(fmtDate(m.join_date))}</div></div>
            <div class="kv"><div class="k">근속일수</div><div class="v mono">${sd ?? "—"}일</div></div>
            <div class="kv"><div class="k">인사변동일자</div><div class="v mono">${changes[0] ? esc(fmtKstDate(changes[0].changed_at)) : "—"}</div></div>
            <div class="kv"><div class="k">경고</div><div class="v">${warn ? `<span class="chip warn-${warn}">경고 ${warn}</span>` : `<span class="chip none">없음</span>`}</div></div>
          </div>
        </div>

        <div class="sect">
          <h3>실적포인트 (주 단위)</h3>
          <div class="week-picker">
            ${weekList.map((w, i) => `<button class="week-pill ${i === modalWeekOffset ? "active" : ""}" data-week="${i}" data-testid="button-week-${i}">${w.label}</button>`).join("")}
          </div>
          ${weekEvents.length ? `
          <div class="timeline">
            ${weekEvents.map((p) => `
              <div class="timeline-item">
                <span class="when">${esc(fmtKstDate(p.event_at))}</span>
                <span class="delta ${p.amount >= 0 ? "pos" : "neg"}">${p.amount >= 0 ? "+" : ""}${p.amount}p</span>
                <span>${esc(p.reason || "—")}</span>
              </div>`).join("")}
          </div>
          <p style="margin-top:12px;font-size:var(--text-sm);color:var(--text-muted);">${modalWeekOffset === 0 ? "이번 주" : "선택한 주"} 합계: <strong class="mono ${weekSum >= 0 ? "pos" : "neg"}" style="color:${weekSum >= 0 ? "var(--success)" : "var(--danger)"}">${weekSum >= 0 ? "+" : ""}${weekSum}p</strong></p>
          ` : `<p class="empty-state" style="padding:24px;">해당 주 실적 기록이 없습니다.</p>`}
        </div>

        <div class="sect">
          <h3>경고 이력</h3>
          ${warns.length ? `
          <div class="timeline">
            ${warns.map((w) => `
              <div class="timeline-item">
                <span class="when">${esc(fmtKstDate(w.given_at))}</span>
                <span><span class="chip ${w.active ? "warn-" + w.stage : "none"}">경고 ${w.stage}${w.active ? "" : " (해제)"}</span> ${esc(w.reason || "—")}</span>
                ${admin && w.active ? `<button class="btn ghost sm" data-resolve="${w.id}" data-testid="button-resolve-warning">해제</button>` : ""}
              </div>`).join("")}
          </div>` : `<p class="empty-state" style="padding:24px;">경고 기록이 없습니다.</p>`}
        </div>

        <div class="sect">
          <h3>인사 이력</h3>
          ${changes.length ? `
          <div class="timeline">
            ${changes.map((c) => `
              <div class="timeline-item">
                <span class="when">${esc(fmtKstDate(c.changed_at))}</span>
                <span><strong>${esc(c.change_type)}</strong> · ${esc(c.detail || "—")}</span>
              </div>`).join("")}
          </div>` : `<p class="empty-state" style="padding:24px;">인사 이력이 없습니다.</p>`}
        </div>

        ${admin ? `
        <div class="sect">
          <h3>관리</h3>
          <div class="inline-actions">
            <button class="btn sm" id="btn-pts" data-testid="button-add-points">실적 포인트 입력</button>
            ${warn < 3 ? `<button class="btn sm ghost" id="btn-warn" data-testid="button-give-warning">경고 ${warn + 1} 부여</button>` : ""}
            <button class="btn sm ghost" id="btn-edit" data-testid="button-edit-member">인원 정보 수정</button>
            ${m.status === "active" ? `<button class="btn sm ghost" id="btn-transfer" data-testid="button-transfer">전출 처리</button>` : ""}
          </div>
        </div>` : ""}
      </div>
    </div>`);

  document.querySelectorAll("#modal-root [data-week]").forEach((b) => {
    b.onclick = () => { modalWeekOffset = Number(b.dataset.week); drawMemberModal(id); };
  });
  document.querySelectorAll("#modal-root [data-resolve]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("해당 경고를 해제하시겠습니까?")) return;
      try {
        await DB.resolveWarning(b.dataset.resolve);
        await refresh(); drawMemberModal(id);
        toast("경고가 해제되었습니다.", "ok");
      } catch (err) { toast(err.message, "err"); }
    };
  });
  const ptsBtn = $("#btn-pts");
  if (ptsBtn) ptsBtn.onclick = () => openPointsForm(m);
  const warnBtn = $("#btn-warn");
  if (warnBtn) warnBtn.onclick = () => openWarningForm(m, warn + 1);
  const editBtn = $("#btn-edit");
  if (editBtn) editBtn.onclick = () => openMemberForm(m);
  const trBtn = $("#btn-transfer");
  if (trBtn) trBtn.onclick = async () => {
    if (!confirm(`${m.roblox_nick} 님을 전출 처리하시겠습니까?`)) return;
    try {
      await DB.updateMember(m.id, { status: "transferred" });
      await DB.addChange({ member_id: m.id, change_type: "전출", detail: "전출 처리", changed_by: S.profile.id });
      await refresh(); drawMemberModal(id);
      toast("전출 처리되었습니다.", "ok");
    } catch (err) { toast(err.message, "err"); }
  };
}

/* ============================================================
   관리자 폼들
   ============================================================ */

function openPointsForm(m) {
  openModal(`
    <div class="modal" role="dialog" aria-label="실적 포인트 입력">
      <div class="modal-head"><h2>실적 포인트 입력 — ${esc(m.roblox_nick)}</h2><button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        <form id="pts-form" class="auth-form">
          <div class="field">
            <label for="pts-amount">포인트 (증가는 양수, 감점은 음수)</label>
            <input id="pts-amount" type="number" value="1" step="1" required data-testid="input-points-amount" />
          </div>
          <div class="field">
            <label for="pts-reason">사유</label>
            <input id="pts-reason" type="text" placeholder="예: 작전 참여 / 훈련 수료 / 규정 위반 감점" maxlength="100" data-testid="input-points-reason" />
          </div>
          <button class="btn full" type="submit" data-testid="button-submit-points">저장</button>
        </form>
      </div>
    </div>`);
  $("#pts-form").onsubmit = async (e) => {
    e.preventDefault();
    const amount = parseInt($("#pts-amount").value, 10);
    if (isNaN(amount) || amount === 0) { toast("0이 아닌 정수를 입력해 주세요.", "err"); return; }
    try {
      await DB.addPoint({
        member_id: m.id, amount,
        reason: $("#pts-reason").value.trim() || "—",
        event_at: new Date().toISOString(),
        awarded_by: S.profile.id,
      });
      await refresh(); drawMemberModal(m.id);
      toast("실적이 기록되었습니다.", "ok");
    } catch (err) { toast(err.message, "err"); }
  };
}

function openWarningForm(m, stage) {
  openModal(`
    <div class="modal" role="dialog" aria-label="경고 부여">
      <div class="modal-head"><h2>경고 ${stage} 부여 — ${esc(m.roblox_nick)}</h2><button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        <form id="warn-form" class="auth-form">
          <div class="field">
            <label for="warn-reason">사유</label>
            <textarea id="warn-reason" rows="3" placeholder="예: 무단 이탈, 집합 지각 반복" required data-testid="input-warning-reason"></textarea>
          </div>
          <button class="btn danger full" type="submit" data-testid="button-submit-warning">경고 ${stage} 부여</button>
        </form>
      </div>
    </div>`);
  $("#warn-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await DB.addWarning({
        member_id: m.id, stage,
        reason: $("#warn-reason").value.trim(),
        given_at: new Date().toISOString(),
        given_by: S.profile.id, active: true,
      });
      await refresh(); drawMemberModal(m.id);
      toast(`경고 ${stage}가 부여되었습니다.`, "ok");
    } catch (err) { toast(err.message, "err"); }
  };
}

function openMemberForm(m) {
  const isEdit = !!m;
  openModal(`
    <div class="modal" role="dialog" aria-label="${isEdit ? "인원 정보 수정" : "인원 추가"}">
      <div class="modal-head"><h2>${isEdit ? "인원 정보 수정" : "신규 인원 추가"}</h2><button class="btn-close" data-close>✕</button></div>
      <div class="modal-body">
        <form id="member-form">
          <div class="form-grid">
            <div class="field full">
              <label for="mf-nick">로블록스 닉</label>
              <input id="mf-nick" type="text" required maxlength="40" value="${esc(m?.roblox_nick || "")}" data-testid="input-nick" />
            </div>
            <div class="field">
              <label for="mf-duty">직책</label>
              <input id="mf-duty" type="text" maxlength="30" value="${esc(m?.duty || "")}" list="duty-list" data-testid="input-duty" />
              <datalist id="duty-list">
                <option value="부중대장"></option><option value="1분대장"></option><option value="2분대장"></option>
                <option value="3분대장"></option><option value="통신병"></option><option value="위생병"></option>
                <option value="탄약병"></option><option value="저격수"></option><option value="일병"></option>
              </datalist>
            </div>
            <div class="field">
              <label for="mf-rank">직위</label>
              <input id="mf-rank" type="text" maxlength="20" value="${esc(m?.rank || "")}" list="rank-list" data-testid="input-rank" />
              <datalist id="rank-list">${RANK_ORDER.map((r) => `<option value="${r}"></option>`).join("")}</datalist>
            </div>
            <div class="field">
              <label for="mf-join">전입일자</label>
              <input id="mf-join" type="date" required value="${esc(m?.join_date || kstDateStr(Date.now()))}" data-testid="input-join" />
            </div>
            ${isEdit ? `
            <div class="field">
              <label for="mf-status">상태</label>
              <select id="mf-status" data-testid="select-member-status">
                <option value="active" ${m.status === "active" ? "selected" : ""}>재직</option>
                <option value="transferred" ${m.status === "transferred" ? "selected" : ""}>전출</option>
                <option value="discharged" ${m.status === "discharged" ? "selected" : ""}>퇴역</option>
              </select>
            </div>` : ""}
          </div>
          <div class="inline-actions">
            <button class="btn" type="submit" data-testid="button-submit-member">${isEdit ? "수정 저장" : "추가"}</button>
          </div>
        </form>
      </div>
    </div>`);
  $("#member-form").onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      roblox_nick: $("#mf-nick").value.trim(),
      duty: $("#mf-duty").value.trim(),
      rank: $("#mf-rank").value.trim(),
      join_date: $("#mf-join").value,
    };
    if (!data.roblox_nick || !data.join_date) { toast("닉네임과 전입일자는 필수입니다.", "err"); return; }
    try {
      if (isEdit) {
        const status = $("#mf-status")?.value || m.status;
        const logs = [];
        if (m.rank !== data.rank) logs.push(`직위 변경: ${m.rank || "없음"} → ${data.rank || "없음"}`);
        if (m.duty !== data.duty) logs.push(`직책 변경: ${m.duty || "없음"} → ${data.duty || "없음"}`);
        if (status !== m.status) logs.push(status === "transferred" ? "전출 처리" : status === "discharged" ? "퇴역 처리" : "복직");
        await DB.updateMember(m.id, { ...data, status });
        for (const detail of logs) {
          await DB.addChange({
            member_id: m.id,
            change_type: detail.startsWith("직위") ? "직위 변경" : detail.startsWith("직책") ? "직책 변경" : "상태 변경",
            detail, changed_by: S.profile.id,
          });
        }
        await refresh(); drawMemberModal(m.id);
        toast("수정되었습니다.", "ok");
      } else {
        const row = await DB.addMember({ ...data, status: "active" });
        await DB.addChange({ member_id: row.id, change_type: "전입", detail: "신규 편입", changed_by: S.profile.id });
        await refresh();
        toast("인원이 추가되었습니다.", "ok");
      }
    } catch (err) { toast(err.message, "err"); }
  };
}

/* ============================================================
   관리 페이지
   ============================================================ */

function renderAdmin() {
  const pending = S.profiles.filter((p) => p.role === "pending");
  const admins = S.profiles.filter((p) => p.role === "admin");

  $("#app").innerHTML = `
    ${renderTopbar("#/admin")}
    ${S.demo ? `<div class="demo-banner">데모 모드 — 샘플 데이터가 표시되고 있습니다.</div>` : ""}
    <main class="page">
      <div class="page-head">
        <div>
          <h1>관리</h1>
          <p class="sub">가입 승인 및 권한 관리</p>
        </div>
        <div class="actions"><button class="btn" id="btn-add-member2" data-testid="button-add-member">인원 추가</button></div>
      </div>

      <div class="sect">
        <h3 style="font-size:var(--text-xs);font-weight:800;letter-spacing:.12em;color:var(--primary);">가입 승인 대기 (${pending.length})</h3>
        ${pending.length ? pending.map((p) => `
          <div class="pending-row" data-testid="row-pending-${esc(p.email)}">
            <div class="info">
              <div class="mail">${esc(p.display_name || p.email)}</div>
              <div class="date">${esc(p.email)} · 신청 ${esc(fmtKstDate(p.created_at))}</div>
            </div>
            <button class="btn sm" data-approve="${p.id}" data-testid="button-approve">승인</button>
            <button class="btn sm ghost" data-reject="${p.id}" data-testid="button-reject">거절</button>
          </div>`).join("")
        : `<div class="table-card"><div class="empty-state"><div class="big">승인 대기 인원이 없습니다</div>가입 신청이 들어오면 이곳에 표시됩니다.</div></div>`}
      </div>

      <div class="sect" style="margin-top:32px;">
        <h3 style="font-size:var(--text-xs);font-weight:800;letter-spacing:.12em;color:var(--primary);">계정 목록</h3>
        <div class="table-card">
          <div class="table-scroll">
            <table class="roster" style="min-width:640px;">
              <thead><tr><th>이름</th><th>이메일</th><th>권한</th><th>신청일</th><th>권한 변경</th></tr></thead>
              <tbody>
                ${S.profiles.map((p) => `
                  <tr data-testid="row-profile-${esc(p.email)}">
                    <td style="cursor:default;">${esc(p.display_name || "—")}</td>
                    <td class="mono">${esc(p.email)}</td>
                    <td>${p.role === "admin" ? `<span class="chip duty">관리자</span>` : p.role === "member" ? `<span class="chip rank">인원</span>` : p.role === "pending" ? `<span class="chip warn-1">대기</span>` : `<span class="chip none">차단</span>`}</td>
                    <td class="mono">${esc(fmtKstDate(p.created_at))}</td>
                    <td style="cursor:default;">${p.id !== S.profile.id && (p.role === "member" || p.role === "admin") ? `<button class="btn sm ghost" data-toggle="${p.id}" data-next="${p.role === "admin" ? "member" : "admin"}" data-testid="button-toggle-role">${p.role === "admin" ? "인원으로 강등" : "관리자로 승격"}</button>` : "—"}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>
        <p style="margin-top:12px;font-size:var(--text-xs);color:var(--text-faint);">관리자 ${admins.length}명 · 실적·경고·인사 변경은 처리자 정보와 함께 기록됩니다.</p>
      </div>
    </main>`;

  document.querySelectorAll("[data-approve]").forEach((b) => {
    b.onclick = async () => {
      try {
        await DB.setUserRole(b.dataset.approve, "member");
        await refresh();
        toast("승인되었습니다.", "ok");
      } catch (err) { toast(err.message, "err"); }
    };
  });
  document.querySelectorAll("[data-reject]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("가입을 거절하고 접근을 차단하시겠습니까?")) return;
      try {
        await DB.setUserRole(b.dataset.reject, "blocked");
        await refresh();
        toast("거절되었습니다.", "ok");
      } catch (err) { toast(err.message, "err"); }
    };
  });
  document.querySelectorAll("[data-toggle]").forEach((b) => {
    b.onclick = async () => {
      const next = b.dataset.next;
      if (!confirm(`권한을 ${next === "admin" ? "관리자" : "인원"}(으)로 변경하시겠습니까?`)) return;
      try {
        await DB.setUserRole(b.dataset.toggle, next);
        await refresh();
        toast("변경되었습니다.", "ok");
      } catch (err) { toast(err.message, "err"); }
    };
  });
  $("#btn-add-member2").onclick = () => openMemberForm(null);
  bindTopbar();
}

/* ============================================================
   시작
   ============================================================ */

(async function boot() {
  try {
    await DB.init();
    if (S.profile) await DB.fetchAll();
  } catch (err) {
    console.error(err);
  }
  route();
})();
