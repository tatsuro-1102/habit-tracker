import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// ---------- 定数 ----------
const CATEGORIES = {
  work: '仕事・経営',
  health: '健康・美容',
  growth: '自己成長',
  private: '人間関係・プライベート',
  life: '睡眠・生活',
  other: 'その他',
};
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// ---------- 便利関数 ----------
const $ = (sel) => document.querySelector(sel);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c != null) node.append(c);
  }
  return node;
}

// 日付は端末のローカル時刻（日本時間）で "YYYY-MM-DD" として扱う
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
const todayStr = () => toDateStr(new Date());

function formatDate(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2500);
}

function showError(target, err) {
  console.error(err);
  target.textContent = err?.message ?? String(err);
  target.hidden = false;
}

// ---------- 起動チェック ----------
const configured = SUPABASE_URL.startsWith('http') && !SUPABASE_ANON_KEY.includes('ここに');
if (!configured) {
  $('#config-error').hidden = false;
  throw new Error('config.js が未設定です');
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- 状態 ----------
const state = {
  habits: [],          // 終了済みも含む（過去の達成率計算のため）
  logs: new Map(),     // "YYYY-MM-DD" -> Set(habit_id)
  date: todayStr(),
  editingId: null,
};

// その日にやる予定の習慣か
function isScheduled(h, dateStr) {
  if (dateStr < toDateStr(new Date(h.created_at))) return false;
  if (h.archived_at && dateStr >= toDateStr(new Date(h.archived_at))) return false;
  return h.target_weekdays.includes(parseDate(dateStr).getDay());
}

function rateFor(dateStr) {
  const scheduled = state.habits.filter((h) => isScheduled(h, dateStr));
  const done = state.logs.get(dateStr) ?? new Set();
  const count = scheduled.filter((h) => done.has(h.id)).length;
  return { done: count, total: scheduled.length };
}

const pct = ({ done, total }) => (total === 0 ? null : Math.round((done / total) * 100));

// ---------- データ読み込み ----------
async function loadHabits() {
  const { data, error } = await sb
    .from('habits')
    .select('*')
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  state.habits = data;
}

async function loadLogs() {
  const from = addDays(state.date, -6);
  const { data, error } = await sb
    .from('habit_logs')
    .select('habit_id, log_date')
    .eq('status', 'done')
    .gte('log_date', from)
    .lte('log_date', state.date);
  if (error) throw error;
  state.logs = new Map();
  for (const r of data) {
    if (!state.logs.has(r.log_date)) state.logs.set(r.log_date, new Set());
    state.logs.get(r.log_date).add(r.habit_id);
  }
}

async function refresh() {
  try {
    await Promise.all([loadHabits(), loadLogs()]);
    renderToday();
    renderManage();
  } catch (err) {
    console.error(err);
    toast('読み込みに失敗しました：' + (err.message ?? err));
  }
}

// ---------- 今日タブ ----------
function renderToday() {
  const isToday = state.date === todayStr();
  $('#date-label').textContent = (isToday ? '今日 ' : '') + formatDate(state.date);
  $('#go-today').hidden = isToday;
  $('#next-day').disabled = isToday;

  // 達成率
  const r = rateFor(state.date);
  const p = pct(r);
  $('#day-rate').textContent = p == null ? '—' : `${p}%`;
  $('#day-count').textContent = r.total ? `${r.done} / ${r.total} 件` : '予定なし';

  // 直近7日のバー
  const bars = $('#week-bars');
  bars.replaceChildren();
  for (let i = 6; i >= 0; i--) {
    const d = addDays(state.date, -i);
    const v = pct(rateFor(d));
    bars.append(
      el('div', { class: 'bar-col', title: `${formatDate(d)}：${v == null ? '予定なし' : v + '%'}` },
        el('div', { class: 'bar-track' },
          el('div', { class: 'bar-fill' + (v == null ? ' none' : ''), style: `height:${v ?? 0}%` })),
        el('div', { class: 'bar-label' + (d === state.date ? ' current' : '') }, WEEKDAYS[parseDate(d).getDay()]),
      ),
    );
  }

  // チェックリスト
  const list = $('#habit-checklist');
  list.replaceChildren();
  const scheduled = state.habits.filter((h) => isScheduled(h, state.date));
  const done = state.logs.get(state.date) ?? new Set();

  for (const h of scheduled) {
    const checked = done.has(h.id);
    list.append(
      el('li', {},
        el('button', {
          class: 'check-item' + (checked ? ' done' : ''),
          'aria-pressed': String(checked),
          onclick: () => toggleHabit(h),
        },
          el('span', { class: 'checkbox', 'aria-hidden': 'true' }, checked ? '✓' : ''),
          el('span', { class: 'check-text' },
            el('span', { class: 'check-name' }, h.name),
            el('span', { class: `chip cat-${h.category}` }, CATEGORIES[h.category]),
          ),
        ),
      ),
    );
  }

  const empty = $('#empty-today');
  if (scheduled.length === 0) {
    empty.textContent = state.habits.some((h) => h.is_active)
      ? 'この日に予定されている習慣はありません。'
      : '「習慣の管理」タブから習慣を追加しましょう。';
    empty.hidden = false;
  } else {
    empty.hidden = true;
  }
}

let toggling = false;
async function toggleHabit(h) {
  if (toggling) return;
  toggling = true;
  const date = state.date;
  const set = state.logs.get(date) ?? new Set();
  const wasDone = set.has(h.id);

  // 先に画面を更新して、失敗したら戻す
  wasDone ? set.delete(h.id) : set.add(h.id);
  state.logs.set(date, set);
  renderToday();

  const { error } = wasDone
    ? await sb.from('habit_logs').delete().eq('habit_id', h.id).eq('log_date', date)
    : await sb.from('habit_logs').upsert(
        { habit_id: h.id, log_date: date, status: 'done', source: 'web' },
        { onConflict: 'habit_id,log_date' },
      );

  if (error) {
    wasDone ? set.add(h.id) : set.delete(h.id);
    renderToday();
    toast('保存できませんでした：' + error.message);
  }
  toggling = false;
}

async function changeDate(newDate) {
  state.date = newDate;
  try {
    await loadLogs();
  } catch (err) {
    toast('読み込みに失敗しました：' + err.message);
  }
  renderToday();
}

$('#prev-day').addEventListener('click', () => changeDate(addDays(state.date, -1)));
$('#next-day').addEventListener('click', () => {
  if (state.date < todayStr()) changeDate(addDays(state.date, 1));
});
$('#go-today').addEventListener('click', () => changeDate(todayStr()));

// ---------- 管理タブ ----------
const categorySelect = $('#category-select');
for (const [value, label] of Object.entries(CATEGORIES)) {
  categorySelect.append(el('option', { value }, label));
}

const weekdayPicker = $('#weekday-picker');
// 月曜始まりで表示
for (const i of [1, 2, 3, 4, 5, 6, 0]) {
  weekdayPicker.append(
    el('label', { class: 'weekday' },
      el('input', { type: 'checkbox', name: 'weekday', value: String(i), checked: true }),
      el('span', {}, WEEKDAYS[i]),
    ),
  );
}

function resetForm() {
  const form = $('#habit-form');
  form.reset();
  form.querySelectorAll('input[name=weekday]').forEach((c) => (c.checked = true));
  state.editingId = null;
  $('#form-title').textContent = '習慣を追加';
  $('#form-submit').textContent = '追加する';
  $('#form-cancel').hidden = true;
  $('#form-error').hidden = true;
}

function startEdit(h) {
  const form = $('#habit-form');
  state.editingId = h.id;
  form.habit_name.value = h.name;
  form.category.value = h.category;
  form.querySelectorAll('input[name=weekday]').forEach((c) => {
    c.checked = h.target_weekdays.includes(Number(c.value));
  });
  $('#form-title').textContent = '習慣を編集';
  $('#form-submit').textContent = '保存する';
  $('#form-cancel').hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.habit_name.focus();
}

$('#form-cancel').addEventListener('click', resetForm);

$('#habit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const errBox = $('#form-error');
  errBox.hidden = true;

  const name = form.habit_name.value.trim();
  const weekdays = [...form.querySelectorAll('input[name=weekday]:checked')].map((c) => Number(c.value)).sort();
  if (!name) return showError(errBox, new Error('名前を入力してください。'));
  if (weekdays.length === 0) return showError(errBox, new Error('曜日を1つ以上選んでください。'));

  const payload = { name, category: form.category.value, target_weekdays: weekdays };
  const submit = $('#form-submit');
  submit.disabled = true;

  const { error } = state.editingId
    ? await sb.from('habits').update(payload).eq('id', state.editingId)
    : await sb.from('habits').insert({
        ...payload,
        sort_order: state.habits.reduce((m, h) => Math.max(m, h.sort_order), 0) + 1,
      });

  submit.disabled = false;
  if (error) return showError(errBox, error);

  toast(state.editingId ? '保存しました' : '追加しました');
  resetForm();
  await refresh();
});

async function archiveHabit(h) {
  if (!confirm(`「${h.name}」を終了しますか？\nこれまでの記録は残ります。`)) return;
  const { error } = await sb
    .from('habits')
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq('id', h.id);
  if (error) return toast('終了できませんでした：' + error.message);
  if (state.editingId === h.id) resetForm();
  toast('終了しました');
  await refresh();
}

function weekdayText(days) {
  if (days.length === 7) return '毎日';
  const sorted = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));
  if (sorted.join() === '1,2,3,4,5') return '平日';
  if (sorted.join() === '6,0') return '土日';
  return sorted.map((d) => WEEKDAYS[d]).join('・');
}

function renderManage() {
  const list = $('#habit-list');
  list.replaceChildren();
  const active = state.habits.filter((h) => h.is_active);
  for (const h of active) {
    list.append(
      el('li', { class: 'card habit-row' },
        el('div', { class: 'habit-info' },
          el('div', { class: 'check-name' }, h.name),
          el('div', { class: 'muted small' },
            el('span', { class: `chip cat-${h.category}` }, CATEGORIES[h.category]),
            ' ', weekdayText(h.target_weekdays)),
        ),
        el('div', { class: 'row' },
          el('button', { class: 'ghost small', onclick: () => startEdit(h) }, '編集'),
          el('button', { class: 'ghost small danger', onclick: () => archiveHabit(h) }, '終了'),
        ),
      ),
    );
  }
  $('#empty-manage').hidden = active.length > 0;
}

// ---------- タブ切り替え ----------
document.querySelectorAll('.tabs [role=tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tabs [role=tab]').forEach((b) =>
      b.setAttribute('aria-selected', String(b === btn)));
    $('#tab-today').hidden = tab !== 'today';
    $('#tab-manage').hidden = tab !== 'manage';
  });
});

// ---------- ログイン ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const errBox = $('#login-error');
  errBox.hidden = true;
  const { error } = await sb.auth.signInWithPassword({
    email: form.email.value.trim(),
    password: form.password.value,
  });
  if (error) showError(errBox, new Error('ログインできませんでした。メールアドレスとパスワードを確認してください。'));
});

$('#logout').addEventListener('click', () => sb.auth.signOut());

let loadedFor = null;
sb.auth.onAuthStateChange((_event, session) => {
  const loggedIn = !!session;
  $('#login-view').hidden = loggedIn;
  $('#app-view').hidden = !loggedIn;
  if (loggedIn && loadedFor !== session.user.id) {
    loadedFor = session.user.id;
    state.date = todayStr();
    // コールバック内で直接 await すると Supabase の内部処理が詰まるため、後で実行する
    setTimeout(refresh, 0);
  }
  if (!loggedIn) loadedFor = null;
});

// 日付をまたいで開きっぱなしの場合、戻ってきたときに今日へ合わせる
let lastSeenToday = todayStr();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !loadedFor) return;
  const now = todayStr();
  if (now !== lastSeenToday) {
    lastSeenToday = now;
    changeDate(now);
  }
});
