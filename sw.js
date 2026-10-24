/* sw.js — 오프라인 실행을 맡는 서비스 워커
 * 앱 파일을 기기에 저장해 두고, 인터넷이 없어도 저장된 파일로 앱을 열어요.
 * BUILD 값은 빌드할 때 파일 내용으로 자동으로 바뀌고, 바뀌면 앱에 "새 버전" 알림이 떠요.
 */
const BUILD = '698cfb4432';
const FIREBASE_VERSION = '13.1.0'; // sync.js와 같아야 해요
const SHELL_CACHE = 'voca-shell-' + BUILD;
const RUNTIME_CACHE = 'voca-runtime-v1';

const SHELL = [
  './', 'index.html', 'app.js', 'core.js', 'words.js', 'sync.js', 'firebase-config.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'
];
const FIREBASE = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js']
  .map(f => `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/${f}`);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    // 동기화용 Firebase 라이브러리도 미리 받아 둬요. 실패해도 설치는 계속하고, 나중에 쓸 때 다시 받아요.
    const rt = await caches.open(RUNTIME_CACHE);
    await Promise.all(FIREBASE.map(async u => {
      try {
        if (await rt.match(u)) return;
        const res = await fetch(u, { mode: 'cors' });
        if (res.ok) await rt.put(u, res);
      } catch (e) { /* 오프라인 등 — 무시 */ }
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('voca-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') return event.respondWith(openApp(req));
    if (url.pathname.endsWith('/firebase-config.js')) return event.respondWith(fresher(req, event));
    return event.respondWith(shellFirst(req));
  }
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    return event.respondWith(runtimeFirst(req));
  }
  if (url.hostname === 'fonts.gstatic.com') return event.respondWith(runtimeFirst(req));
  if (url.hostname === 'fonts.googleapis.com') return event.respondWith(runtimeFirst(req, 'text/css'));
  // 그 밖의 요청(로그인, 동기화 서버)은 그대로 인터넷으로 보내요.
});

async function openApp(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match('./') || await cache.match('index.html');
  if (hit) return hit;
  return fetch(req);
}

async function shellFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  return hit || fetch(req);
}

/* 설정 파일은 저장본을 바로 쓰고, 뒤에서 새로 받아 다음 실행에 반영해요 */
async function fresher(req, event) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) return cache.put(req, res.clone()).then(() => res);
    return null;
  }).catch(() => null);
  event.waitUntil(net);
  if (hit) return hit;
  return (await net) || new Response('window.FIREBASE_CONFIG = window.FIREBASE_CONFIG || null;', {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' }
  });
}

async function runtimeFirst(req, fallbackType) {
  const cache = await caches.open(RUNTIME_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    if (fallbackType) return new Response('', { headers: { 'Content-Type': fallbackType } });
    return Response.error();
  }
}
