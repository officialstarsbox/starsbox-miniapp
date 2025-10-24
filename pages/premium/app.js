/* ========= REF (session-only, unified) ========= */
(function () {
  // если глобальный app.js уже дал getRefCode — не переопределяем
  if (typeof window.getRefCode === 'function') return;

  const KEY = 'sb_in_ref';
  const RE  = /^[A-Z0-9]{3,32}$/;

  function save(code){ try{ if(RE.test(code)) sessionStorage.setItem(KEY, code); }catch{} }
  function load(){ try{ const v=sessionStorage.getItem(KEY); return RE.test(v||'')?v:null; }catch{ return null; } }

  function parseInbound(){
    const tg = window.Telegram?.WebApp;
    let raw =
      tg?.initDataUnsafe?.start_param ??
      new URL(location.href).searchParams.get('startapp') ??
      new URL(location.href).searchParams.get('start') ??
      new URL(location.href).searchParams.get('ref') ??
      null;
    if(!raw) return null;
    raw = String(raw).trim();
    const m = raw.match(/^ref[:=_-]+([A-Za-z0-9]{3,32})$/i);
    let code = m ? m[1] : (/^[A-Za-z0-9]{3,32}$/.test(raw) ? raw : null);
    return code ? code.toUpperCase() : null;
  }

  const inbound = parseInbound();
  if (inbound) save(inbound);
  window.getRefCode = () => load();
})();

/* ========= Базовая UI-логика ========= */
(function(){
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $  = (s, r) => (r||document).querySelector(s);
  const $$ = (s, r) => Array.from((r||document).querySelectorAll(s));

  // нормализация username: только латиница/цифры/_, лидирующий '@'
  function normalizeWithAt(raw){
    const core = String(raw||'').replace(/@/g,'').replace(/[^A-Za-z0-9_]/g,'').slice(0,32);
    return core ? '@'+core : '';
  }
  function getSelfUsername(){
    const tg = window.Telegram?.WebApp;
    try{ tg?.ready?.(); }catch{}
    const u = tg?.initDataUnsafe?.user?.username;
    if (u) return String(u).replace(/[^A-Za-z0-9_]/g,'').slice(0,32);
    try{
      const q = new URLSearchParams(location.search).get('tg_username');
      return q ? String(q).replace(/[^A-Za-z0-9_]/g,'').slice(0,32) : null;
    }catch{ return null; }
  }

  ready(() => {
    const nfRub2  = new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
    const tg      = window.Telegram?.WebApp || null;

    const usernameInput = $('#tgUsername');
    const buyForMeBtn   = $('#buyForMeBtn');

    const packsWrap     = $('#subsPacks');            // контейнер пакетов
    const packBtns      = $$('#subsPacks .pack-item');
    const totalValueEl  = $('#totalValue');           // сюда кладём сумму ₽
    const paySbpBtn     = $('#paySbpBtn');
    const payCryptoBtn  = $('#payCryptoBtn');

    /* ---- username field ---- */
    if (usernameInput){
      usernameInput.addEventListener('input', () => {
        const nv = normalizeWithAt(usernameInput.value);
        if (usernameInput.value !== nv){
          usernameInput.value = nv;
          try{ usernameInput.setSelectionRange(nv.length,nv.length); }catch{}
        }
        reevaluate();
      });
      usernameInput.addEventListener('blur', () => {
        if (usernameInput.value === '@') usernameInput.value = '';
      });
      usernameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter'){ e.preventDefault(); usernameInput.blur(); }
      });
    }

    if (buyForMeBtn && usernameInput){
      buyForMeBtn.addEventListener('click', () => {
        const me = getSelfUsername();
        if (!me){
          window.Telegram?.WebApp?.showToast?.('В вашем профиле Telegram не указан username');
          return;
        }
        usernameInput.value = '@'+me;
        usernameInput.dispatchEvent(new Event('input',{bubbles:true}));
        usernameInput.blur();
      });
    }

    /* ---- пакеты: выбор срока и цены ---- */
    function paintPrices(){
      packBtns.forEach(btn => {
        const priceEl = btn.querySelector('[data-price-el]');
        const price   = Number(String(btn.dataset.price||'0').replace(',','.'));
        const img     = btn.querySelector('.pack-icon img');
        if (priceEl) priceEl.textContent = `${nfRub2.format(price)} ₽`;
        if (img && btn.dataset.icon) img.src = btn.dataset.icon;
      });
    }
    function selectPack(btn){
      packBtns.forEach(b=>{
        const active = (b===btn);
        b.classList.toggle('is-selected', active);
        b.setAttribute('aria-pressed', active?'true':'false');
        const img = b.querySelector('.pack-icon img');
        const src = active ? (b.dataset.iconActive||b.dataset.icon) : b.dataset.icon;
        if (img && src) img.src = src;
      });
      refreshTotal();
      reevaluate();
    }
    packsWrap?.addEventListener('click', e => {
      const btn = e.target.closest('.pack-item');
      if (!btn) return;
      selectPack(btn);
    });

    function getSelectedPack(){
      const btn = packBtns.find(b=>b.classList.contains('is-selected'));
      if (!btn) return null;
      const months = parseInt(btn.dataset.months||'0',10) || 0;
      const price  = Number(String(btn.dataset.price||'0').replace(',','.')) || 0;
      return { months, priceRub: price };
    }

    /* ---- итог ₽ ---- */
    function refreshTotal(){
      const sel  = getSelectedPack();
      const sum  = sel ? sel.priceRub : 0;
      const minor= Math.round(sum*100);
      if (totalValueEl){
        totalValueEl.textContent = `${nfRub2.format(sum)} руб.`;
        totalValueEl.dataset.amountMinor = String(minor);
        totalValueEl.dataset.months      = String(sel?sel.months:0);
      }
    }

    /* ---- вкл/выкл оплаты ---- */
    const USER_RE = /^@[A-Za-z0-9_]{1,32}$/;
    function userOk(){ return USER_RE.test(String(usernameInput?.value||'').trim()); }
    function monthsOk(){ return (parseInt(totalValueEl?.dataset?.months||'0',10) || 0) > 0; }
    function amountOk(){
      const m = Number(totalValueEl?.dataset?.amountMinor||'0');
      return Number.isInteger(m) && m>0;
    }
    function setPayEnabled(on){
      [paySbpBtn,payCryptoBtn].forEach(b=>{
        if (!b) return;
        b.disabled = !on;
        b.setAttribute('aria-disabled', String(!on));
      });
    }
    function reevaluate(){ setPayEnabled(userOk() && monthsOk() && amountOk()); }

    /* ---- оплата ---- */
    const API_BASE       = 'https://api.starsbox.org';
    const PRODUCT        = 'premium';
    const CURRENCY       = 'RUB';
    const THANKS_SUCCESS = window.PAY_SUCCESS_URL;
    const THANKS_FAIL    = window.PAY_FAIL_URL;

    function setLoading(is){
      [paySbpBtn,payCryptoBtn].forEach(b=>{
        if (!b) return;
        b.disabled = !!is;
        b.classList.toggle('is-loading', !!is);
        b.setAttribute('aria-disabled', String(!!is));
      });
    }
    function openLink(url){
      if (!url) return;
      if (typeof window.openInsideTelegram === 'function'){
        try{ window.openInsideTelegram(url); return; }catch{}
      }
      if (tg?.openLink){ try{ tg.openLink(url); return; }catch{} }
      location.href = url;
    }

    async function initiatePayment(provider){
      try{
        setLoading(true);

        const username    = String(usernameInput?.value||'').trim();
        const months      = parseInt(totalValueEl?.dataset?.months||'0',10) || 0;
        const amountMinor = Number(totalValueEl?.dataset?.amountMinor||'0') || 0;

        if (!USER_RE.test(username)){ alert('Укажите корректный username (например, @username).'); return; }
        if (!months){ alert('Выберите срок подписки.'); return; }
        if (!amountMinor){ alert('Сумма к оплате не рассчитана.'); return; }

        const payload = {
          provider,                 // "wata" | "heleket"
          product: PRODUCT,         // "premium"
          username,                 // "@user"
          months,                   // срок (бэку также подойдёт qty=months)
          qty: months,
          amount_minor: amountMinor,
          currency: CURRENCY,

          // рефералка и плательщик — если есть
          ref_code:   (window.getRefCode && window.getRefCode()) || undefined,
          actor_tg_id: tg?.initDataUnsafe?.user?.id || undefined,

          // возврат внутрь мини-аппа (оба варианта имён — для совместимости)
          success_url: THANKS_SUCCESS,
          fail_url:    THANKS_FAIL,
          successUrl:  THANKS_SUCCESS,
          returnUrl:   THANKS_FAIL
        };

        const resp = await fetch(`${API_BASE}/pay/initiate`, {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          credentials: 'omit',
          body: JSON.stringify(payload)
        });
        if (!resp.ok){
          const txt = await resp.text().catch(()=> '');
          throw new Error(`HTTP ${resp.status} ${resp.statusText} ${txt||''}`.trim());
        }
        const data = await resp.json();
        if (!data?.ok || !data.payment_url){
          throw new Error(`Некорректный ответ сервера: ${JSON.stringify(data)}`);
        }
        openLink(data.payment_url);
      }catch(e){
        console.error('[pay/initiate premium]', e);
        alert(`Не удалось создать платёж.\n${e?.message||e}`);
      }finally{
        setLoading(false);
      }
    }

    /* ---- инициализация ---- */
    function initPayButtons(){
      paySbpBtn   ?.addEventListener('click', () => initiatePayment('wata'));
      payCryptoBtn?.addEventListener('click', () => initiatePayment('heleket'));
    }
    function initCloseKeyboardOnOutsideTap(){
      function blurIfOutside(e){
        const ae = document.activeElement;
        if (!ae) return;
        const isInput = ae.tagName==='INPUT' || ae.tagName==='TEXTAREA';
        if (!isInput) return;
        if (ae.contains(e.target)) return;
        ae.blur();
      }
      document.addEventListener('pointerdown', blurIfOutside, { capture:true });
      document.addEventListener('touchstart',  blurIfOutside, { capture:true });
    }

    try{ tg?.ready?.(); }catch{}
    paintPrices();
    refreshTotal();
    reevaluate();
    initPayButtons();
    initCloseKeyboardOnOutsideTap();
  });
})();



