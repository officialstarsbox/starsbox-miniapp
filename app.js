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
/* === referral helpers (глобальные) === */
(function(){
  // base36-энкодер идентичный серверному (для генерации "моей ссылки")
  function encodeRefCode(n){
    const abc = "0123456789abcdefghijklmnopqrstuvwxyz";
    n = Math.floor(Number(n) || 0);
    let s = "";
    while(n){ s = abc[n % 36] + s; n = Math.floor(n / 36); }
    return "r" + (s || "0");
  }

  // 1) читаем реф-код при запуске: из start_param (tg) или из ?ref= (веб)
  function captureRefFromLaunch(){
    try{
      const tg = window.Telegram && window.Telegram.WebApp;
      const sp = tg?.initDataUnsafe?.start_param;
      let code = null;

      // формат: startapp=ref:rabc...
      if (sp && typeof sp === 'string' && sp.toLowerCase().startsWith('ref:')) {
        code = sp.slice(4).trim();
      }

      // запасной путь: ?ref=... в URL
      const url = new URL(window.location.href);
      const q = (url.searchParams.get('ref') || url.hash.replace(/^#/, '').split('&').map(kv=>kv.split('=')).find(x=>x[0]==='ref')?.[1] || '').trim();
      if (!code && q) code = q;

      if (code){
        localStorage.setItem('sb_ref_code', code);
        document.cookie = `sb_ref=${code}; Path=/; Max-Age=${60*60*24*365}`;
      }
      return code || localStorage.getItem('sb_ref_code') || null;
    }catch(e){ return localStorage.getItem('sb_ref_code') || null; }
  }

  // 2) получить актуальный реф-код (из LS/cookie)
  window.getRefCode = function(){
    return localStorage.getItem('sb_ref_code') || (document.cookie.match(/(?:^|;\s*)sb_ref=([^;]+)/)?.[1] ?? null) || null;
  };

  // 3) «моя реф-ссылка» для шеринга
  window.getMyRefLink = function(botUsername){
    try{
      const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
      if (!u?.id) return "";
      const code = encodeRefCode(u.id);
      const startapp = 'ref:' + code;
      const bot = (botUsername || 'StarssBox_bot').replace(/^@/,'');
      return `https://t.me/${bot}?startapp=${encodeURIComponent(startapp)}`;
    }catch{ return ""; }
  };

  // вызвать один раз на загрузке любой страницы
  captureRefFromLaunch();
})();