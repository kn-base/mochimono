/* 持ち物 — 自分の持ち物と、使ってきた年月を記録するPWA（消耗品の買い替えどきも管理）
 * データ：非公開リポジトリのJSON（GitHub Contents APIで読み書き）
 *   持ち物：private/mochimono/items.json ／ 消耗品：同じフォルダの consumables.json
 * 認証：GitHubのアクセストークン（端末のブラウザ内だけに保存。コードには書かない）
 */
(() => {
  'use strict';

  // ---------- ジャンル（13個）と線のアイコン ----------
  // アイコンは 24×24 の枠に、細い線一本で描く
  const CATEGORIES = {
    clothes:   { label: '服',           en: 'Clothing',  icon: '<path d="M9 4 4.5 6.5 6 10.5l2-.8V20h8V9.7l2 .8 1.5-4L15 4c-.4 1.5-1.6 2.4-3 2.4S9.4 5.5 9 4z"/>' },
    shoes:     { label: '靴',           en: 'Shoes',     icon: '<path d="M3.5 8.5 7 8l2.2 3c1.8 1 3.8 1.2 5.8 1.6l3.4.8c1.6.4 2.6 1.6 2.6 3.1V18H3.5z"/><path d="M3.5 15.5H21"/><path d="M9.6 11.6l-1 1.4M11.6 12.3l-.8 1.3"/>' },
    bag:       { label: 'バッグ',       en: 'Bag',       icon: '<path d="M5.5 9h13l-1 11h-11z"/><path d="M9 9V7.5a3 3 0 0 1 6 0V9"/>' },
    accessory: { label: 'アクセサリー', en: 'Accessory', icon: '<circle cx="12" cy="14.5" r="5.5"/><path d="m12 9 2-2.2-1-1.8h-2l-1 1.8z"/>' },
    watch:     { label: '時計',         en: 'Watch',     icon: '<circle cx="12" cy="12" r="5"/><path d="M9 7.6 9.6 3.5h4.8l.6 4.1M9 16.4l.6 4.1h4.8l.6-4.1"/><path d="M12 9.8V12l1.5 1"/>' },
    perfume:   { label: '香水',         en: 'Fragrance', icon: '<rect x="7.5" y="10" width="9" height="10.5" rx="2"/><path d="M10.2 10V7.8h3.6V10"/><rect x="10.7" y="4.5" width="2.6" height="3.3" rx=".5"/>' },
    furniture: { label: '家具',         en: 'Furniture', icon: '<path d="M8 3.5v9.5"/><path d="M8 13h9"/><path d="M8 13l-.8 7.5M17 13l.8 7.5"/><path d="M8 3.5c1.5.3 2.2 1 2.2 2.2V13"/>' },
    interior:  { label: 'インテリア雑貨', en: 'Interior', icon: '<path d="M10 13h4c0 1.8 2 2.8 2 5 0 2-1.6 2.8-4 2.8s-4-.8-4-2.8c0-2.2 2-3.2 2-5z"/><path d="M12 13V4.5"/><path d="M12 8.5c1.9 0 3.3-1.3 3.7-3.3-1.9 0-3.3 1.3-3.7 3.3zM12 10.5c-1.9 0-3.3-1.3-3.7-3.3 1.9 0 3.3 1.3 3.7 3.3z"/>' },
    appliance: { label: '家電',         en: 'Appliance', icon: '<rect x="3.5" y="5" width="17" height="11.5" rx="1.5"/><path d="M12 16.5V20M8.5 20h7"/>' },
    gadget:    { label: 'ガジェット',   en: 'Gadget',    icon: '<rect x="7.5" y="3" width="9" height="18" rx="2"/><path d="M11 18h2"/>' },
    tableware: { label: '食器',         en: 'Tableware', icon: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M9.5 19.6h5"/><path d="M10 8c0-1 .8-1.4.8-2.4M13.4 8c0-1 .8-1.4.8-2.4"/>' },
    kitchen:   { label: 'キッチン用品', en: 'Kitchen',   icon: '<path d="M5.5 10.5h13V17a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3z"/><path d="M4.5 10.5h15"/><path d="M10.5 8h3"/><path d="M5.5 13H3.5M18.5 13h2"/>' },
    other:     { label: 'その他',       en: 'Other',     icon: '<path d="m12 3.5 7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z"/><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 11.9v8.6"/>' },
  };
  const ORDER = Object.keys(CATEGORIES);

  // 使った期間で変わるドットの色（植物の一生：芽吹き→若葉→紅葉→実り）
  const STAGES = [
    { min: 5, color: '#b8a06a' }, // 5年以上：彩度の低い黄金色
    { min: 3, color: '#f26b2a' }, // 3〜5年：オレンジ
    { min: 1, color: '#a5c43c' }, // 1〜3年：黄緑
    { min: 0, color: '#8cc7dd' }, // 1年未満：淡い水色
  ];
  const RELEASED_DOT = '#c7c7cc';

  const LS_SETTINGS = 'mochimono.settings';
  const LS_CACHE = 'mochimono.cache';
  const LS_FILTER = 'mochimono.filter';
  const LS_MODE = 'mochimono.mode';
  const DEFAULT_PATH = 'private/mochimono/items.json';
  const CONS_FILE = 'consumables.json';
  const EMPTY = () => ({ version: 1, items: [] });

  // ---------- 状態 ----------
  let settings = readLS(LS_SETTINGS) || { repo: '', path: DEFAULT_PATH, token: '' };
  const cache = readLS(LS_CACHE) || {};
  // 2つのデータファイル。それぞれ別々にGitHubへ保存する
  const stores = {
    items: { label: '持ち物', path: () => settings.path.trim(), data: EMPTY(), sha: null, missing: false },
    cons:  { label: '消耗品', path: () => settings.path.trim().replace(/[^/]*$/, CONS_FILE), data: EMPTY(), sha: null, missing: false },
  };
  if (cache.data) cache.items = { data: cache.data, sha: cache.sha }; // 前の版の控え
  for (const k of Object.keys(stores)) {
    const c = cache[k];
    if (c && normalize(c.data)) { stores[k].data = c.data; stores[k].sha = c.sha || null; }
  }
  let filter = readLS(LS_FILTER) || 'all';
  let mode = readLS(LS_MODE) === 'cons' ? 'cons' : 'items';
  let panel = null;        // null | { type: 'detail', id } | { type: 'summary' } | { type: 'review', year }
  let panelPushed = false; // 履歴に1つ積んだか（Androidの戻る操作用）
  let saveChain = Promise.resolve();

  const $ = (s, el = document) => el.querySelector(s);
  const items = () => stores.items.data.items;
  const cons = () => stores.cons.data.items;

  // ---------- 小物 ----------
  function readLS(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存できない環境では無視 */ } }
  function saveCache() {
    writeLS(LS_CACHE, Object.fromEntries(Object.entries(stores).map(([k, s]) => [k, { data: s.data, sha: s.sha }])));
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16)).replace(/-/g, '').slice(0, 10);
  }
  function yen(n) { return '¥' + Math.round(n).toLocaleString('ja-JP'); }
  function num(v) {
    const s = String(v ?? '').replace(/[,，¥￥円\s]/g, '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  function icon(cat, cls = '') {
    const c = CATEGORIES[cat] || CATEGORIES.other;
    return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${c.icon}</svg>`;
  }
  function catOf(it) { return CATEGORIES[it.category] ? it.category : 'other'; }

  // 日付はすべて「YYYY-MM-DD」の文字列で扱う（時差でずれないように）
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function dayNum(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; }
  function addYears(s, n) {
    const [y, m, d] = s.split('-').map(Number);
    const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate(); // 2/29 → 平年は 2/28
    return `${y + n}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
  }
  function fmtDate(s) {
    if (!isDate(s)) return '';
    const [y, m, d] = s.split('-').map(Number);
    return `${y}年${m}月${d}日`;
  }
  function fmtMD(s) { return isDate(s) ? `${Number(s.slice(5, 7))}.${Number(s.slice(8, 10))}` : ''; }

  // 使った期間。購入当日を1日目と数える。1年を超えたら「◯年◯日」（記念日からの日数）
  function age(it) {
    if (!isDate(it.purchased)) return null;
    const end = isDate(it.released) ? it.released : today();
    const diff = Math.max(0, dayNum(end) - dayNum(it.purchased));
    const days = diff + 1;
    let y = 0;
    while (dayNum(addYears(it.purchased, y + 1)) <= dayNum(end)) y++;
    if (y === 0) return { y: 0, d: days, days };
    return { y, d: dayNum(end) - dayNum(addYears(it.purchased, y)), days };
  }
  function ageHtml(a) {
    if (!a) return '<span class="age">—</span>';
    if (!a.y) return `<span class="age">${a.d}<i>日</i></span>`;
    return `<span class="age">${a.y}<i>年</i>${a.d ? `${a.d}<i>日</i>` : ''}</span>`;
  }
  function perDay(it) {
    const a = age(it);
    if (!a || !Number.isFinite(it.price)) return null;
    const v = it.price / a.days;
    return v >= 10 ? yen(v) : '¥' + (Math.round(v * 10) / 10).toFixed(1);
  }
  function dotColor(it) {
    if (it.released) return RELEASED_DOT;
    const a = age(it);
    const y = a ? a.y : 0;
    return STAGES.find(s => y >= s.min).color;
  }
  function dot(it) { return `<i class="dot" style="--c:${dotColor(it)}" aria-hidden="true"></i>`; }
  // ちょうど5年の日（ドットが黄金色に変わる日）だけ true。手放した物は除く
  function isFifthAnniversary(it) {
    return !it.released && isDate(it.purchased) && addYears(it.purchased, 5) === today();
  }

  // 消耗品：最後に替えた日からの経過日数（替えた当日は0日＝「今日」）
  function sinceReplaced(c) { return isDate(c.replaced) ? Math.max(0, dayNum(today()) - dayNum(c.replaced)) : null; }
  function isDue(c) { const d = sinceReplaced(c); return d != null && Number.isFinite(c.interval) && d >= c.interval; }
  // 目安の日数 ⇔ 表示（1か月＝30日、1年＝365日）
  function splitInterval(days) {
    if (!Number.isFinite(days) || days <= 0) return { n: '', unit: 'month' };
    if (days % 365 === 0) return { n: days / 365, unit: 'year' };
    if (days % 30 === 0) return { n: days / 30, unit: 'month' };
    return { n: days, unit: 'day' };
  }
  const UNITS = { day: { label: '日', days: 1 }, month: { label: 'か月', days: 30 }, year: { label: '年', days: 365 } };
  function intervalLabel(days) {
    const { n, unit } = splitInterval(days);
    return n === '' ? '' : `${n}${UNITS[unit].label}`;
  }

  function normalize(d) {
    if (!d || !Array.isArray(d.items)) return null;
    d.items.forEach(it => {
      if (!it.id) it.id = uid();
      if (it.price != null && !Number.isFinite(it.price)) it.price = num(it.price);
      if (it.interval != null && !Number.isFinite(it.interval)) it.interval = num(it.interval);
    });
    return d;
  }
  function sorted(list) {
    return [...list].sort((a, b) => {
      const pa = a.purchased || '', pb = b.purchased || '';
      if (pa !== pb) return pa < pb ? 1 : -1;
      return String(a.name).localeCompare(String(b.name), 'ja');
    });
  }
  // 消耗品：替えどきが近い順（残り日数が少ないものが上）。未記録は下
  function sortedCons(list) {
    const left = c => { const d = sinceReplaced(c); return d == null ? Infinity : (Number.isFinite(c.interval) ? c.interval : 1e6) - d; };
    return list.map((c, i) => ({ c, i })).sort((a, b) => {
      const la = left(a.c), lb = left(b.c);
      if (la !== lb) return la < lb ? -1 : 1;
      return a.i - b.i;
    }).map(x => x.c);
  }
  function findItem(id) { return items().find(x => x.id === id); }

  function toast(msg, ms = 1800) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  // ---------- GitHub ----------
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }
  function connected() { return !!(settings.repo && settings.path && settings.token); }
  function apiUrl(path) {
    return `https://api.github.com/repos/${settings.repo.trim()}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  }
  function authHeaders(json) {
    return {
      Authorization: `Bearer ${settings.token.trim()}`,
      Accept: 'application/vnd.github+json',
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }
  async function loadStore(key) {
    const st = stores[key];
    const res = await fetch(`${apiUrl(st.path())}?_=${Date.now()}`, { cache: 'no-store', headers: authHeaders() });
    if (res.status === 404) {
      // GitHubは「権限がない」ときも404を返すので、リポジトリ自体が見えるかで原因を分ける
      const repoRes = await fetch(`https://api.github.com/repos/${settings.repo.trim()}`, { cache: 'no-store', headers: authHeaders() });
      if (!repoRes.ok) throw new Error(`リポジトリ「${settings.repo.trim()}」が見つからないか、トークンにこのリポジトリの権限がありません`);
      st.data = EMPTY(); st.sha = null; st.missing = true;
      return 'missing';
    }
    if (res.status === 401 || res.status === 403) throw new Error('トークンが無効か、権限が足りません');
    if (!res.ok) throw new Error(`読み込みに失敗しました（${res.status}）`);
    const j = await res.json();
    const parsed = normalize(JSON.parse(b64decode(j.content)));
    if (!parsed) throw new Error(`${st.label}の記録データの形式が正しくありません`);
    st.data = parsed; st.sha = j.sha; st.missing = false;
    return 'ok';
  }
  async function putStore(key, d, message) {
    const st = stores[key];
    const res = await fetch(apiUrl(st.path()), {
      method: 'PUT', cache: 'no-store', headers: authHeaders(true),
      body: JSON.stringify({ message, content: b64encode(JSON.stringify(d, null, 2) + '\n'), ...(st.sha ? { sha: st.sha } : {}) }),
    });
    if (res.status === 409 || res.status === 422) throw Object.assign(new Error('conflict'), { conflict: true });
    if (!res.ok) throw new Error(`保存に失敗しました（${res.status}）`);
    const j = await res.json();
    st.sha = j.content.sha; st.missing = false;
  }

  // 変更をその場で反映し、裏でGitHubに保存する（1回の変更＝1コミット）。失敗したら元に戻す
  function commit(key, message, mutate) {
    if (!connected()) { toast('先に設定でGitHubとつないでください', 2600); openSettings(); return Promise.resolve(false); }
    const st = stores[key];
    const before = JSON.stringify(st.data);
    mutate(st.data);
    saveCache();
    render();
    const snapshot = JSON.parse(JSON.stringify(st.data));
    saveChain = saveChain.then(async () => {
      toast('保存しています…', 10000);
      try {
        await putStore(key, snapshot, message);
        saveCache();
        toast('保存しました');
        return true;
      } catch (e) {
        st.data = JSON.parse(before);
        if (e.conflict) {
          try { await loadStore(key); } catch { /* 読み直しに失敗してもひとまず元に戻す */ }
          toast('別の端末で更新されていたため、最新を読み込みました。もう一度お願いします', 4200);
        } else {
          toast(e.message || '保存に失敗しました', 3600);
        }
        saveCache();
        render();
        return false;
      }
    });
    return saveChain;
  }

  // ---------- 見出し ----------
  function renderTop() {
    document.body.classList.toggle('mode-cons', mode === 'cons');
    $('#kicker').textContent = mode === 'cons' ? 'Consumables' : 'Belongings';
    document.querySelectorAll('.mode').forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on);
    });
    $('#add-btn').setAttribute('aria-label', mode === 'cons' ? '消耗品を追加' : '持ち物を追加');
    if (mode === 'cons') {
      const due = cons().filter(isDue).length;
      $('#stats').textContent = cons().length ? `${cons().length} ITEMS${due ? ` · ${due} DUE` : ''}` : '';
    } else {
      const owned = items().filter(x => !x.released).length;
      const gone = items().length - owned;
      $('#stats').textContent = items().length ? `${owned} ITEMS${gone ? ` · ${gone} RELEASED` : ''}` : '';
    }
  }

  function renderTabs() {
    const tabs = $('#tabs');
    if (mode === 'cons') { tabs.hidden = true; return; }
    const present = ORDER.filter(k => items().some(x => catOf(x) === k));
    if (filter !== 'all' && !present.includes(filter)) filter = 'all';
    tabs.hidden = present.length < 2;
    tabs.innerHTML = [['all', 'すべて'], ...present.map(k => [k, CATEGORIES[k].label])]
      .map(([k, label]) => `<button type="button" class="tab${k === filter ? ' is-active' : ''}" data-filter="${k}">${label}</button>`).join('');
  }

  // ---------- 一覧（持ち物） ----------
  function emptyHtml(what) {
    return `<div class="empty">${icon('other')}${connected()
      ? `まだ${what}が登録されていません。<br>右下の「＋」から追加できます。`
      : '右上の設定（歯車）から、<br>GitHubとつないでください。'}</div>`;
  }
  function renderItemList(animate) {
    const list = sorted(items()).filter(x => filter === 'all' || catOf(x) === filter);
    if (!list.length) return emptyHtml('何も');
    return `<ul class="items">${list.map((it, i) => {
      const pd = perDay(it);
      return `<li class="item${it.released ? ' released' : ''}" data-id="${esc(it.id)}" style="${animate ? `--d:${Math.min(i, 14) * 40}ms` : 'animation:none'}">
        ${icon(catOf(it))}
        <div>
          <p class="item-name">${dot(it)}<span>${esc(it.name)}</span>${isFifthAnniversary(it) ? '<span class="anniv">今日で5年</span>' : ''}</p>
          ${pd ? `<p class="item-sub">${pd}/日</p>` : it.released ? '<p class="item-sub"></p>' : ''}
        </div>
        <div class="item-age">${ageHtml(age(it))}</div>
      </li>`;
    }).join('')}</ul>`;
  }

  // ---------- 一覧（消耗品） ----------
  function renderConsList(animate) {
    const list = sortedCons(cons());
    if (!list.length) return emptyHtml('消耗品');
    const t = today();
    return `<ul class="items cons">${list.map((c, i) => {
      const d = sinceReplaced(c);
      const due = isDue(c);
      const iv = intervalLabel(c.interval);
      return `<li class="item cons-item${due ? ' due' : ''}" data-cid="${esc(c.id)}" style="${animate ? `--d:${Math.min(i, 14) * 40}ms` : 'animation:none'}">
        <div>
          <p class="item-name"><span>${esc(c.name)}</span></p>
          <p class="cons-sub">${iv ? `<span>目安 ${iv}</span>` : ''}${due ? '<span class="due-note">そろそろ替えどき</span>' : ''}</p>
        </div>
        <div class="item-age">${d == null ? '<span class="age unrec">未記録</span>' : d === 0 ? '<span class="age today">今日</span>' : `<span class="age">${d}<i>日</i></span>`}</div>
        <button type="button" class="swap-btn" data-swap="${esc(c.id)}"${c.replaced === t ? ' disabled' : ''}>${c.replaced === t ? '替えた' : '今日替えた'}</button>
      </li>`;
    }).join('')}</ul>`;
  }

  function renderList(animate) {
    $('#list').innerHTML = mode === 'cons' ? renderConsList(animate) : renderItemList(animate);
  }

  // ---------- 詳細 ----------
  function renderDetail(it) {
    const c = CATEGORIES[catOf(it)];
    const pd = perDay(it);
    const facts = [
      ['購入日', fmtDate(it.purchased)],
      ['購入価格', Number.isFinite(it.price) ? yen(it.price) : ''],
      ['手放した日', it.released ? fmtDate(it.released) : ''],
    ].filter(([, v]) => v);
    return `
      <button type="button" class="back" data-act="back">← 一覧</button>
      <div class="detail-hero">
        ${icon(catOf(it))}
        <p class="detail-genre">${c.en}</p>
        <h2 class="detail-name">${esc(it.name)}</h2>
        ${it.model ? `<p class="detail-model">${esc(it.model)}</p>` : ''}
        ${isFifthAnniversary(it) ? '<p class="anniv anniv-lg">今日で5年</p>' : ''}
        <div class="detail-figures">
          <div>${ageHtml(age(it))}<span class="fig-label">${dot(it)}${it.released ? 'Owned' : 'With me'}</span></div>
          <div>${pd ? `<span class="per-day">${pd}<i>/日</i></span>` : '<span class="per-day">—</span>'}<span class="fig-label">Per day</span></div>
        </div>
        ${it.released ? `<p class="released-note">${fmtDate(it.released)}に手放しました</p>` : ''}
      </div>
      <dl class="facts">
        ${facts.map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}
        ${it.memo ? `<div class="fact"><dt>メモ</dt><dd class="memo">${esc(it.memo)}</dd></div>` : ''}
      </dl>
      <div class="detail-actions">
        <button type="button" class="btn" data-act="edit">編集</button>
        ${it.released
          ? '<button type="button" class="btn" data-act="unrelease">持ち物に戻す</button>'
          : '<button type="button" class="btn" data-act="release">手放す</button>'}
      </div>
      <button type="button" class="delete-link" data-act="delete">削除</button>`;
  }

  // ---------- 集計 ----------
  function renderSummary() {
    const rows = ORDER.map(k => {
      const all = items().filter(x => catOf(x) === k);
      const own = all.filter(x => !x.released);
      const s = a => a.reduce((t, x) => t + (Number.isFinite(x.price) ? x.price : 0), 0);
      return { k, own: s(own), ownN: own.length, all: s(all), allN: all.length };
    }).filter(r => r.allN);
    const tot = rows.reduce((t, r) => ({ own: t.own + r.own, ownN: t.ownN + r.ownN, all: t.all + r.all, allN: t.allN + r.allN }), { own: 0, ownN: 0, all: 0, allN: 0 });
    const year = Number(today().slice(0, 4));
    return `
      <button type="button" class="back" data-act="back">← 一覧</button>
      <div class="sum-head">
        <p class="detail-genre" style="text-align:left">Summary</p>
        <h2 class="sum-title">ジャンル別の合計</h2>
      </div>
      <div class="sum-total">
        <div><span class="fig-label" style="margin:0 0 6px">今持っている分</span><b>${yen(tot.own)}</b><small>${tot.ownN} ITEMS</small></div>
        <div><span class="fig-label" style="margin:0 0 6px">今までに使った分</span><b>${yen(tot.all)}</b><small>${tot.allN} ITEMS</small></div>
      </div>
      ${rows.length ? `
        <div class="sum-cols"><span></span><span>Genre</span><span>持っている</span><span>今まで</span></div>
        <ul class="sum-list">${rows.map((r, i) => `
          <li class="sum-row" style="--d:${i * 40}ms">
            ${icon(r.k)}
            <span class="sum-name">${CATEGORIES[r.k].label}</span>
            <span class="sum-yen${r.ownN ? '' : ' zero'}">${yen(r.own)}<small>${r.ownN}点</small></span>
            <span class="sum-yen">${yen(r.all)}<small>${r.allN}点</small></span>
          </li>`).join('')}
        </ul>
        <p class="sum-note">「今までに使った分」は、手放した物も含めた購入価格の合計です。</p>` : '<p class="empty">まだ何も登録されていません。</p>'}
      <button type="button" class="review-link" data-act="review" data-year="${year}">
        <span><small>Year in review</small>${year}年の振り返り</span><span aria-hidden="true">→</span>
      </button>`;
  }

  // ---------- 1年の振り返り ----------
  function reviewYears() {
    const ys = new Set([Number(today().slice(0, 4))]);
    for (const it of items()) {
      if (isDate(it.purchased)) ys.add(Number(it.purchased.slice(0, 4)));
      if (isDate(it.released)) ys.add(Number(it.released.slice(0, 4)));
    }
    return [...ys].sort((a, b) => a - b);
  }
  function joinNames(list) {
    const names = list.map(x => `「${esc(x.name)}」`);
    if (names.length <= 3) return names.join('と');
    return `${names.slice(0, 2).join('、')}ほか${names.length - 2}点`;
  }
  function renderReview(year) {
    const y = String(year), t = today();
    const inYear = s => isDate(s) && s.slice(0, 4) === y;
    const bought = sorted(items().filter(x => inYear(x.purchased))).reverse();
    const released = items().filter(x => inYear(x.released)).sort((a, b) => a.released < b.released ? -1 : 1);
    // その年に5年を迎えた物（5年経つ前に手放した物は除く。今年の分は今日までに迎えた物だけ）
    const golden = items().filter(x => {
      if (!isDate(x.purchased)) return false;
      const d5 = addYears(x.purchased, 5);
      return inYear(d5) && d5 <= t && !(x.released && x.released < d5);
    }).sort((a, b) => a.purchased < b.purchased ? -1 : 1);
    const total = bought.reduce((s, x) => s + (Number.isFinite(x.price) ? x.price : 0), 0);
    const years = reviewYears();
    const i = years.indexOf(year);
    const prev = i > 0 ? years[i - 1] : null, next = i >= 0 && i < years.length - 1 ? years[i + 1] : null;
    const row = (x, date, note = '') => `<li class="rv-row">${icon(catOf(x))}<span class="rv-name">${esc(x.name)}</span><span class="rv-date">${note || fmtMD(date)}</span></li>`;
    const section = (label, list, fn) => list.length ? `
      <section class="rv-sec">
        <p class="section-label">${label}<small>${list.length}</small></p>
        <ul class="rv-list">${list.map(fn).join('')}</ul>
      </section>` : '';
    const isEmpty = !bought.length && !released.length && !golden.length;
    return `
      <button type="button" class="back" data-act="back-summary">← 合計</button>
      <div class="rv-head">
        <p class="detail-genre">Year in review</p>
        <div class="rv-year">
          <button type="button" class="rv-nav" data-act="year" data-year="${prev ?? ''}"${prev == null ? ' disabled' : ''} aria-label="前の年">‹</button>
          <h2>${year}</h2>
          <button type="button" class="rv-nav" data-act="year" data-year="${next ?? ''}"${next == null ? ' disabled' : ''} aria-label="次の年">›</button>
        </div>
      </div>
      ${isEmpty ? '<p class="empty">この年の記録はありません。</p>' : `
        ${section('迎えた物', bought, x => row(x, x.purchased))}
        ${section('5年を迎えた物', golden, x => `<li class="rv-row">${icon(catOf(x))}<span class="rv-name"><i class="dot" style="--c:${STAGES[0].color}" aria-hidden="true"></i>${esc(x.name)}</span><span class="rv-date">${fmtMD(addYears(x.purchased, 5))}</span></li>`)}
        ${section('手放した物', released, x => row(x, x.released))}
        <div class="rv-end">
          <p class="rv-sentence">${bought.length
            ? `${year === Number(t.slice(0, 4)) ? '今年' : `${year}年`}は${joinNames(bought)}を迎えて、`
            : `${year}年は、新しく迎えた物はありませんでした。`}</p>
          ${bought.length ? `<p class="rv-total"><small>総額</small>${yen(total)}</p>` : ''}
        </div>`}`;
  }

  // ---------- 画面の切り替え ----------
  const panelEl = $('#panel');
  function renderPanel() {
    if (!panel) return;
    if (panel.type === 'detail') {
      const it = findItem(panel.id);
      if (!it) { closePanel(); return; }
      $('#panel-body').innerHTML = renderDetail(it);
    } else if (panel.type === 'review') {
      $('#panel-body').innerHTML = renderReview(panel.year);
    } else {
      $('#panel-body').innerHTML = renderSummary();
    }
  }
  function openPanel(p) {
    const wasOpen = !!panel;
    panel = p;
    renderPanel();
    if (wasOpen) {
      // 画面の中で切り替えるときも、ふわっと入れ替える
      const body = $('#panel-body');
      body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap');
      panelEl.scrollTo({ top: 0 });
      return;
    }
    panelEl.hidden = false;
    panelEl.classList.remove('closing');
    panelEl.scrollTop = 0;
    document.body.classList.add('panel-open', 'locked');
    try { history.pushState({ panel: true }, ''); panelPushed = true; } catch { panelPushed = false; }
  }
  function closePanel(fromHistory = false) {
    if (!panel) return;
    panel = null;
    if (panelPushed && !fromHistory) { panelPushed = false; history.back(); }
    panelPushed = false;
    panelEl.classList.add('closing');
    document.body.classList.remove('panel-open', 'locked');
    setTimeout(() => { if (!panel) { panelEl.hidden = true; panelEl.classList.remove('closing'); } }, 330);
  }
  window.addEventListener('popstate', () => { if (panel) { panelPushed = false; closePanel(true); } });

  function render(animate = false) {
    renderTop();
    renderTabs();
    renderList(animate);
    renderPanel();
  }

  // ---------- 操作 ----------
  document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.mode === mode) return;
    mode = b.dataset.mode;
    writeLS(LS_MODE, mode);
    window.scrollTo({ top: 0 });
    render(true);
  }));
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-filter]');
    if (!b || b.dataset.filter === filter) return;
    filter = b.dataset.filter;
    writeLS(LS_FILTER, filter);
    renderTabs();
    renderList(true);
    const tb = $(`.tab[data-filter="${filter}"]`);
    if (tb) tb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });
  $('#list').addEventListener('click', e => {
    const sw = e.target.closest('[data-swap]');
    if (sw) {
      const c = cons().find(x => x.id === sw.dataset.swap);
      if (!c) return;
      if (c.replaced === today()) { toast('今日はもう記録してあります'); return; }
      const t = today();
      commit('cons', `消耗品：「${c.name}」を替えた（${t}）`, d => { const x = d.items.find(y => y.id === c.id); if (x) x.replaced = t; });
      return;
    }
    const crow = e.target.closest('[data-cid]');
    if (crow) { const c = cons().find(x => x.id === crow.dataset.cid); if (c) openConsForm(c); return; }
    const row = e.target.closest('.item');
    if (row) openPanel({ type: 'detail', id: row.dataset.id });
  });
  $('#summary-btn').addEventListener('click', () => openPanel({ type: 'summary' }));
  $('#settings-btn').addEventListener('click', () => openSettings());
  $('#add-btn').addEventListener('click', () => (mode === 'cons' ? openConsForm(null) : openItemForm(null)));
  panelEl.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'back') { closePanel(); return; }
    if (act === 'back-summary') { openPanel({ type: 'summary' }); return; }
    if (act === 'review' || act === 'year') { if (b.dataset.year) openPanel({ type: 'review', year: Number(b.dataset.year) }); return; }
    const it = panel && panel.type === 'detail' ? findItem(panel.id) : null;
    if (!it) return;
    if (act === 'edit') openItemForm(it);
    if (act === 'release') openReleaseForm(it);
    if (act === 'unrelease') {
      commit('items', `持ち物：「${it.name}」を持ち物に戻した`, d => { const x = d.items.find(y => y.id === it.id); if (x) delete x.released; });
    }
    if (act === 'delete') {
      if (await confirmDialog(`「${it.name}」を削除しますか？`, '削除する')) {
        closePanel();
        commit('items', `持ち物：「${it.name}」を削除`, d => { d.items = d.items.filter(y => y.id !== it.id); });
      }
    }
  });
  window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', window.scrollY > 4), { passive: true });

  // ---------- モーダル・フォーム ----------
  const modal = $('#modal');
  const form = $('#form');
  let formState = null; // { draft, html, validate, onSubmit, onDelete, deleteText }

  function openModal() {
    modal.hidden = false;
    modal.classList.remove('closing');
    document.body.classList.add('locked');
  }
  function closeModal() {
    return new Promise(res => {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.hidden = true; modal.classList.remove('closing');
        if (!panel) document.body.classList.remove('locked');
        res();
      }, 280);
    });
  }
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  function confirmDialog(text, yesLabel = 'はい') {
    return new Promise(res => {
      const ov = $('#confirm');
      $('#confirm-text').textContent = text;
      $('#confirm-yes').textContent = yesLabel;
      ov.hidden = false;
      const finish = v => {
        ov.classList.add('closing');
        setTimeout(() => { ov.hidden = true; ov.classList.remove('closing'); }, 280);
        $('#confirm-yes').onclick = $('#confirm-no').onclick = null;
        res(v);
      };
      $('#confirm-yes').onclick = () => finish(true);
      $('#confirm-no').onclick = () => finish(false);
    });
  }

  function genreTiles(value) {
    return `<div class="genres">${ORDER.map(k => `
      <label class="genre"><input type="radio" name="category" value="${k}"${k === value ? ' checked' : ''}><span>${icon(k)}${CATEGORIES[k].label}</span></label>`).join('')}</div>`;
  }
  function actionsHtml(submitLabel = '保存', withDelete = false) {
    return `<div class="form-actions">
      ${withDelete ? '<button type="button" class="btn-text-danger" data-form="delete">削除</button>' : ''}
      <div class="right">
        <button type="button" class="btn btn-ghost" data-form="cancel">やめる</button>
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </div>`;
  }
  function collect() {
    const fd = new FormData(form);
    for (const [k, v] of fd.entries()) formState.draft[k] = v;
  }
  function renderForm() {
    form.innerHTML = formState.html(formState.draft);
    form.parentElement.scrollTop = 0;
  }

  form.addEventListener('click', async e => {
    const b = e.target.closest('[data-form]');
    if (!b) return;
    if (b.dataset.form === 'cancel') closeModal();
    if (b.dataset.form === 'delete' && await confirmDialog(formState.deleteText, formState.deleteLabel || '消す')) { await closeModal(); formState.onDelete(); }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    collect();
    const err = formState.validate ? formState.validate(formState.draft) : '';
    if (err) { toast(err, 2600); return; }
    const d = formState.draft;
    await closeModal();
    formState.onSubmit(d);
  });

  // --- 持ち物の追加・編集 ---
  function openItemForm(it) {
    const isNew = !it;
    formState = {
      draft: it
        ? { name: it.name || '', category: catOf(it), purchased: it.purchased || '', price: Number.isFinite(it.price) ? String(it.price) : '', model: it.model || '', memo: it.memo || '' }
        : { name: '', category: '', purchased: today(), price: '', model: '', memo: '' },
      html: d => `<h3 class="form-title">${isNew ? '持ち物を追加' : '編集'}</h3>
        <label class="field"><span>品名</span><input name="name" value="${esc(d.name)}" autocomplete="off" enterkeyhint="next"></label>
        <div class="field-label">ジャンル</div>
        ${genreTiles(d.category)}
        <div class="field-row">
          <label class="field"><span>購入日</span><input name="purchased" type="date" value="${esc(d.purchased)}" max="${today()}"></label>
          <label class="field"><span>購入価格（円）</span><input name="price" value="${esc(d.price)}" inputmode="numeric" autocomplete="off" placeholder="例：48000"></label>
        </div>
        <label class="field"><span>型番・JAN（任意）</span><input name="model" value="${esc(d.model)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <label class="field"><span>メモ（任意）</span><textarea name="memo" rows="3" placeholder="買ったときの思い出、購入場所など">${esc(d.memo)}</textarea></label>
        ${actionsHtml()}`,
      validate: d => {
        if (!String(d.name).trim()) return '品名を入れてください';
        if (!CATEGORIES[d.category]) return 'ジャンルを選んでください';
        if (!isDate(d.purchased)) return '購入日を入れてください';
        if (d.purchased > today()) return '購入日が未来になっています';
        if (it && it.released && d.purchased > it.released) return '購入日が手放した日より後になっています';
        const p = num(d.price);
        if (Number.isNaN(p) || (p != null && p < 0)) return '購入価格は数字で入れてください';
        return '';
      },
      onSubmit: d => {
        const rec = {
          name: d.name.trim(), category: d.category, purchased: d.purchased,
          price: num(d.price), model: d.model.trim(), memo: d.memo.trim(),
        };
        if (isNew) {
          const id = uid();
          commit('items', `持ち物：「${rec.name}」を追加`, data => {
            const x = { id, name: rec.name, category: rec.category };
            if (rec.model) x.model = rec.model;
            x.purchased = rec.purchased;
            if (rec.price != null) x.price = rec.price;
            if (rec.memo) x.memo = rec.memo;
            data.items.push(x);
          });
        } else {
          commit('items', `持ち物：「${rec.name}」を修正`, data => {
            const x = data.items.find(y => y.id === it.id);
            if (!x) return;
            for (const k of ['name', 'category', 'purchased']) x[k] = rec[k];
            for (const k of ['price', 'model', 'memo']) { if (rec[k] == null || rec[k] === '') delete x[k]; else x[k] = rec[k]; }
          });
        }
      },
    };
    renderForm();
    openModal();
  }

  // --- 手放す ---
  function openReleaseForm(it) {
    formState = {
      draft: { released: today() },
      html: d => `<h3 class="form-title">「${esc(it.name)}」を手放す</h3>
        <label class="field"><span>手放した日</span><input name="released" type="date" value="${esc(d.released)}" min="${esc(it.purchased || '')}" max="${today()}"></label>
        <p class="field-hint">記録は消えずに、一覧で薄く表示されます。期間と1日あたりの値段は、この日で止まります。売れた値段や理由は、編集からメモに書いておけます。</p>
        ${actionsHtml('手放す')}`,
      validate: d => !isDate(d.released) ? '手放した日を入れてください'
        : d.released > today() ? '手放した日が未来になっています'
        : it.purchased && d.released < it.purchased ? '手放した日が購入日より前になっています' : '',
      onSubmit: d => {
        commit('items', `持ち物：「${it.name}」を手放した`, data => {
          const x = data.items.find(y => y.id === it.id);
          if (x) x.released = d.released;
        });
      },
    };
    renderForm();
    openModal();
  }

  // --- 消耗品の追加・編集 ---
  function openConsForm(c) {
    const isNew = !c;
    const iv = splitInterval(c ? c.interval : 30);
    formState = {
      draft: { name: c ? c.name : '', n: String(iv.n), unit: iv.unit, replaced: c && c.replaced ? c.replaced : '', memo: c && c.memo ? c.memo : '' },
      html: d => `<h3 class="form-title">${isNew ? '消耗品を追加' : '消耗品を編集'}</h3>
        <label class="field"><span>品名</span><input name="name" value="${esc(d.name)}" autocomplete="off" placeholder="例：黒の靴下 5足"></label>
        <div class="field-label">買い替えの目安</div>
        <div class="interval">
          <input name="n" value="${esc(d.n)}" inputmode="numeric" autocomplete="off" aria-label="目安の数">
          <div class="units">${Object.entries(UNITS).map(([k, u]) => `
            <label class="unit"><input type="radio" name="unit" value="${k}"${k === d.unit ? ' checked' : ''}><span>${u.label}</span></label>`).join('')}</div>
        </div>
        <label class="field"><span>最後に替えた日（空欄なら未記録）</span><input name="replaced" type="date" value="${esc(d.replaced)}" max="${today()}"></label>
        <label class="field"><span>メモ（任意）</span><textarea name="memo" rows="2">${esc(d.memo)}</textarea></label>
        ${actionsHtml('保存', !isNew)}`,
      validate: d => {
        if (!String(d.name).trim()) return '品名を入れてください';
        const n = num(d.n);
        if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return '目安は1以上の整数で入れてください';
        if (!UNITS[d.unit]) return '目安の単位を選んでください';
        if (d.replaced && !isDate(d.replaced)) return '替えた日の形が正しくありません';
        if (d.replaced > today()) return '替えた日が未来になっています';
        return '';
      },
      onSubmit: d => {
        const rec = { name: d.name.trim(), interval: num(d.n) * UNITS[d.unit].days, replaced: d.replaced || '', memo: d.memo.trim() };
        const apply = x => {
          x.name = rec.name; x.interval = rec.interval;
          if (rec.replaced) x.replaced = rec.replaced; else delete x.replaced;
          if (rec.memo) x.memo = rec.memo; else delete x.memo;
        };
        if (isNew) {
          const id = uid();
          commit('cons', `消耗品：「${rec.name}」を追加`, data => { const x = { id }; apply(x); data.items.push(x); });
        } else {
          commit('cons', `消耗品：「${rec.name}」を修正`, data => { const x = data.items.find(y => y.id === c.id); if (x) apply(x); });
        }
      },
      deleteText: c ? `「${c.name}」を削除しますか？` : '',
      deleteLabel: '削除する',
      onDelete: () => commit('cons', `消耗品：「${c.name}」を削除`, data => { data.items = data.items.filter(y => y.id !== c.id); }),
    };
    renderForm();
    openModal();
  }

  // --- 設定 ---
  function openSettings() {
    formState = {
      draft: { repo: settings.repo, path: settings.path || DEFAULT_PATH, token: settings.token },
      html: d => `<h3 class="form-title">設定</h3>
        <label class="field"><span>記録データのリポジトリ</span><input name="repo" value="${esc(d.repo)}" placeholder="持ち主名/リポジトリ名" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <label class="field"><span>ファイルの場所（持ち物）</span><input name="path" value="${esc(d.path)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <p class="field-hint" style="margin-top:-10px;margin-bottom:16px">消耗品は、同じフォルダの ${CONS_FILE} に保存されます。</p>
        <label class="field"><span>GitHubアクセストークン</span><input name="token" type="password" value="${esc(d.token)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <p class="field-hint">トークンはこの端末のブラウザの中だけに保存され、GitHub以外には送られません。端末ごとに一度だけ入力します。</p>
        <div class="form-actions">
          ${settings.token ? '<button type="button" class="btn-text-danger" data-form="delete">この端末から消す</button>' : ''}
          <div class="right">
            <button type="button" class="btn btn-ghost" data-form="cancel">やめる</button>
            <button type="submit" class="btn btn-primary">つなぐ</button>
          </div>
        </div>`,
      validate: d => !/^[\w.-]+\/[\w.-]+$/.test(String(d.repo).trim()) ? 'リポジトリは「持ち主名/リポジトリ名」の形で入れてください'
        : !String(d.token).trim() ? 'トークンを入れてください' : '',
      onSubmit: async d => {
        settings = { repo: d.repo.trim(), path: (d.path || DEFAULT_PATH).trim(), token: d.token.trim() };
        writeLS(LS_SETTINGS, settings);
        await refresh(true);
      },
      deleteText: 'この端末から、トークンと記録データの控えを消します。よろしいですか？（GitHub上のデータは消えません）',
      onDelete: () => {
        settings = { repo: '', path: DEFAULT_PATH, token: '' };
        try { localStorage.removeItem(LS_SETTINGS); localStorage.removeItem(LS_CACHE); } catch { /* 無視 */ }
        for (const st of Object.values(stores)) { st.data = EMPTY(); st.sha = null; }
        closePanel();
        render(true);
        toast('この端末から消しました');
      },
    };
    renderForm();
    openModal();
  }

  async function refresh(announce) {
    if (!connected()) { if (announce) render(true); return; }
    const before = JSON.stringify([stores.items.data, stores.cons.data]);
    try {
      if (announce) toast('読み込んでいます…', 10000);
      const r = await loadStore('items');
      // 消耗品のファイルがまだ無いのは問題ない（最初に保存したときに作られる）
      await loadStore('cons');
      saveCache();
      if (r === 'missing') toast(`「${settings.path.trim()}」が見つかりません。ファイルの場所を確認してください（新しく始める場合は、持ち物を追加すると作られます）`, 6000);
      else if (announce) toast('つながりました');
      if (announce || JSON.stringify([stores.items.data, stores.cons.data]) !== before) render(true);
    } catch (e) {
      toast(e.message, 6000);
    }
  }

  // ---------- 起動 ----------
  render(true);
  requestAnimationFrame(() => document.body.classList.add('ready'));
  refresh(false);

  // アプリに戻ってきたら最新を読み込む（入力中は除く）。日付が変わっていれば期間・色・記念日も更新される
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !modal.hidden) return;
    render();
    refresh(false);
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
