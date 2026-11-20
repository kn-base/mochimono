// 持ち物 — オフラインでも開けるようにアプリ本体を保存しておく
// 旅行アプリと同じ kn-base.github.io の下にあり、保存場所（キャッシュ）を共有するため、
// 名前に「mochimono-」を付け、消すときも自分の分だけを消す
const PREFIX = 'mochimono-shell-';
const VERSION = 'v2';
const SHELL = PREFIX + VERSION;
const ASSETS = [
  './', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith(PREFIX) && k !== SHELL).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // GitHubは毎回取りに行く（保存しない）
  if (url.origin !== location.origin) return;
  // 自分のフォルダの外（旅行アプリなど）には手を出さない
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  // アプリ本体：保存分をすぐ出し、裏で新しいものに入れ替える
  e.respondWith(caches.open(SHELL).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
