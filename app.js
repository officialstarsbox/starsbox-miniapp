(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  // ===== App base (работает и локально, и на GH Pages) =====
  window.APP_BASE = (function () {
    // https://officialstarsbox.github.io/starsbox-miniapp-deploy/...
    // parts -> ["starsbox-miniapp-deploy", ...]
    const parts = location.pathname.split('/').filter(Boolean);
    const repo  = parts.length ? '/' + parts[0] : '';
    return location.origin + repo;                  // -> https://officialstarsbox.github.io/starsbox-miniapp-deploy
  })();
  window.PAY_SUCCESS_URL = window.APP_BASE + '/pages/pay/success/';
  window.PAY_FAIL_URL    = window.APP_BASE + '/pages/pay/fail/';

  // Открыть мини-апп StarssBox с payload (используй везде)
function openMiniApp(payload=''){
  const bot = 'StarssBox_bot'; // без @
  const sp  = payload ? encodeURIComponent(payload) : '';
  const tme = `https://t.me/${bot}?startapp=${sp}`;

  if (window.Telegram?.WebApp?.openTelegramLink) {
    Telegram.WebApp.openTelegramLink(tme);
  } else {
    location.href = tme; // откроется браузерный Telegram
  }
}

  // --- Telegram WebApp helpers ---
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    try {
      tg.ready();                   // даём знать Telegram, что веб-приложение готово
      tg.expand();                  // разворачиваем по высоте
      tg.enableClosingConfirmation(); // подтверждение при закрытии (опционально)
    } catch (e) {
      console.warn('tg init error:', e);
    }
  }

  // Делаем доступными глобально
  window.tg = tg;

  window.openInsideTelegram = function (url) {
    try {
      if (tg && typeof tg.openLink === 'function') {
        // откроет поверх мини-аппа, НЕ в системном браузере
        tg.openLink(url);
      } else {
        window.location.href = url; // фолбэк
      }
    } catch (e) {
      console.warn('openInsideTelegram fallback:', e);
      window.location.href = url;
    }
  };

  // обрезка по длине с многоточием (считаем пробелы)
  function truncate(str, max) {
    const s = String(str || '');
    return s.length > max ? s.slice(0, max).trimEnd() + '…' : s;
  }

  // читаем данные из Telegram WebApp (или из query для локальных тестов)
  function readUser() {
    let first = '', last = '', username = '', photo = '';

    try { tg?.ready?.(); } catch (e) {}

    try {
      const u = tg?.initDataUnsafe?.user;
      if (u) {
        first = u.first_name || '';
        last = u.last_name || '';
        username = u.username || '';
        photo = u.photo_url || '';
      }
    } catch (e) {}

    // фолбэки для локальной отладки:
    const qs = new URLSearchParams(location.search);
    first = first || qs.get('first') || '';
    last = last || qs.get('last') || '';
    username = username || qs.get('username') || '';
    photo = photo || qs.get('photo') || '';

    return { first, last, username, photo };
  }

  ready(() => {
    const photoEl = document.getElementById('userPhoto');
    const nameEl = document.getElementById('userFullName');
    const userEl = document.getElementById('userUsername');

    const { first, last, username, photo } = readUser();

    const fullName = [first, last].filter(Boolean).join(' ').trim() || 'Даниил Маландийqqqq';
    if (nameEl) nameEl.textContent = truncate(fullName, 15);

    const showUsername = username ? '@' + username : 'groupBetaa';
    if (userEl) userEl.textContent = truncate(showUsername, 10);

    if (photoEl && photo) {
      photoEl.src = photo;
    }

    // Автоподстановка фонов из data-bg — переносим внутрь ready
    document.querySelectorAll('.panel-card[data-bg]').forEach(card => {
      const url = card.getAttribute('data-bg');
      const bg = card.querySelector('.panel-bg');
      if (bg && url) bg.style.backgroundImage = `url(${url})`;
    });
  });
})();
// ==== /app.js — Хук возврата из платежки по start_param =====
(function(){
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const API = 'https://api.starsbox.org';

  function parseStartParam(){
    try { tg?.ready?.(); } catch {}
    const url = new URL(window.location.href);
    // при открытии через t.me используется ?startapp=..., через обычный start — ?start=...
    return (tg?.initDataUnsafe?.start_param) || url.searchParams.get('startapp') || url.searchParams.get('start') || '';
  }

  function extractOrderId(sp){
    // принимаем: resume:<id>, success:<id>, paid:<id>, fail:<id>
    const m = String(sp||'').trim().match(/^(?:resume|success|paid|fail)[:_\-]+(.+)$/i);
    return m ? m[1] : null;
  }

  async function fetchStatus(orderId){
    const endpoints = [
      `${API}/pay/status/${encodeURIComponent(orderId)}`,
      `${API}/wata/dg/status/${encodeURIComponent(orderId)}` // запасной путь
    ];
    for (const u of endpoints){
      try{
        const r = await fetch(u, { headers: { 'Accept':'application/json' } });
        if (!r.ok) continue;
        const d = await r.json().catch(()=>null);
        if (d) return d;
      }catch{}
    }
    return null;
  }

  function showBanner(orderId, text){
    const box = document.getElementById('returnBanner');
    if (!box){ tg?.showToast?.(`Заказ ${orderId}: ${text}`); return; }
    box.querySelector('[data-order]').textContent  = orderId;
    box.querySelector('[data-status]').textContent = text;
    box.hidden = false;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const sp = parseStartParam();
    const orderId = extractOrderId(sp);
    if (!orderId) return;

    let text = 'в обработке';
    try{
      const s = await fetchStatus(orderId);
      if (s){
        const paid = !!(s.paid || (s.ok && (s.status==='paid' || s.status==='success')) || s.provider_status==='Success');
        text = paid ? 'оплачен' : (s.status || 'в обработке');
      }
    }catch{}
    showBanner(orderId, text);
  });
})();
// === referral helpers (глобальные) ===
(function(){
  // валиден только код вида r + base36 (то же, что на сервере)
  const REF_RE = /^r[0-9a-z]{1,31}$/;

  function isValidRef(code){
    return REF_RE.test(String(code||'').trim().toLowerCase());
  }

  function saveRef(code){
    try{
      const c = String(code||'').toLowerCase();
      if (!isValidRef(c)) return false;
      localStorage.setItem('sb_ref_code', c);
      // 1 год, SameSite=Lax (чтобы не терялся при возврате из платежки)
      document.cookie = `sb_ref=${c}; Path=/; Max-Age=${60*60*24*365}; SameSite=Lax`;
      return true;
    }catch{ return false; }
  }

  function loadRef(){
    try{
      const ls = localStorage.getItem('sb_ref_code');
      if (isValidRef(ls)) return ls;
      const m = document.cookie.match(/(?:^|;\s*)sb_ref=([^;]+)/);
      if (m && isValidRef(m[1])) return m[1].toLowerCase();
    }catch{}
    return null;
  }

  function sanitizeMaybeRef(raw){
    if (!raw) return null;
    let s = String(raw).trim().toLowerCase();
    // допускаем формы: "ref:xxxx", "xxxx"
    if (s.startsWith('ref:')) s = s.slice(4).trim();
    // выбросим мусор в query/anchor (например ref=xxx&foo=bar)
    s = s.split(/[&?#]/)[0];
    return isValidRef(s) ? s : null;
  }

  function captureRefFromLaunch(){
    const tg = window.Telegram && window.Telegram.WebApp;

    // 1) Telegram WebApp start_param / startparam
    let raw = null;
    try{
      tg?.ready?.();
      raw = tg?.initDataUnsafe?.start_param || tg?.initDataUnsafe?.startparam || null;
    }catch{}

    // 2) ?startapp=... или ?start=... в URL
    if (!raw){
      const u = new URL(window.location.href);
      raw = u.searchParams.get('startapp') || u.searchParams.get('start') || null;
    }

    // 2.5) tgWebAppStartParam в URL (Telegram так часто пробрасывает payload)
    if (!raw){
      const u = new URL(window.location.href);
      raw = u.searchParams.get('tgWebAppStartParam') || u.searchParams.get('tgwebappstartparam') || null;
    }

    // 3) явный ?ref= / #ref= в URL (для локальных тестов)
    if (!raw){
      const u = new URL(window.location.href);
      raw = u.searchParams.get('ref')
         || (u.hash||'').replace(/^#/, '')
              .split('&').map(s=>s.split('=')).find(([k])=>k==='ref')?.[1]
         || null;
    }

    // нормализуем и сохраняем, если валидно
    const maybe = sanitizeMaybeRef(raw);
    if (maybe) {
      saveRef(maybe);
      return maybe;
    }

    // подчистим старый мусор, если был
    const cached = loadRef();
    if (!isValidRef(cached)){
      try{
        localStorage.removeItem('sb_ref_code');
        document.cookie = 'sb_ref=; Path=/; Max-Age=0';
      }catch{}
      return null;
    }
    return cached;
  }

  // публичные хелперы
  window.getRefCode = function(){
    return loadRef();
  };

  // пригодится на страницах оплаты: прокинуть actor_tg_id в /pay/initiate
  window.getActorTgId = function(){
    try{
      const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      return (typeof id === 'number' && isFinite(id)) ? id : null;
    }catch{ return null; }
  };

  // «моя реф-ссылка» (генерация кода — на бэке; здесь только сборка ссылки,
  // если код уже сохранён; иначе вернём ссылку без кода)
  window.getMyRefLink = function(botUsername){
    const bot = (botUsername || 'StarssBox_bot').replace(/^@/, '');
    const code = loadRef();
    const payload = code ? `ref:${code}` : '';
    return `https://t.me/${bot}?startapp=${encodeURIComponent(payload)}`;
  };

  // вызвать один раз при загрузке страницы
  captureRefFromLaunch();
})();