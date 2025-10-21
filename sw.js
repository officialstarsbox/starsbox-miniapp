/* simple cache-first SW for StarsBox */
const BASE = '/starsbox-miniapp-deploy/';
const CACHE = 'sb-cache-v1'; // <— увеличивай при обновлениях ассетов

// добавь сюда ВСЕ тяжёлые картинки и ключевые страницы
const PRECACHE = [
  BASE,
  BASE + 'index.html',
  BASE + 'styles.css',
  BASE + 'app.js',
  BASE + 'pages/pay/success/index.html',
  BASE + 'pages/pay/fail/index.html',
  BASE + 'assets/logo.svg',
  BASE + 'pages/gifts/index.html',
  // примеры фонов:
  BASE + 'assets/backgrounds/steam3.jpg',
  BASE + 'assets/backgrounds/your-hero1.jpg',
  BASE + 'assets/icons/credit-rub.svg',
  // …добавь остальные изображения, иконки, css/js
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE) ? undefined : caches.delete(k)))
    ).then(() => self.clients.claim())
  );
  // сообщим странице, что кэш готов — можно скрывать splash
  self.clients.matchAll({type:'window'}).then(clients => {
    clients.forEach(c => c.postMessage('sw-ready'));
  });
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // только наши запросы (та же origin)
  if (new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then(res => res || fetch(req).then(net => {
      // положим в кэш копии GET-запросов (для последующих заходов)
      if (req.method === 'GET') {
        const copy = net.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
      }
      return net;
    }).catch(() => res)) // оффлайн — отдадим то, что есть
  );
});
