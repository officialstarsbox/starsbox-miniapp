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

/* ========= UI / валидация ========= */
(function () {
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $ = (s, r) => (r || document).querySelector(s);

  function normalizeWithAt(raw){
    const core = String(raw || '').replace(/@/g,'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,32);
    return core ? '@' + core : '';
  }

  function getSelfUsername(){
    const tg = window.Telegram && window.Telegram.WebApp;
    try { tg?.ready?.(); } catch {}
    const u = tg?.initDataUnsafe?.user?.username;
    if (u) return String(u).replace(/[^a-zA-Z0-9_]/g,'').slice(0,32);
    try {
      const q = new URLSearchParams(location.search).get('tg_username');
      return q ? String(q).replace(/[^a-zA-Z0-9_]/g,'').slice(0,32) : null;
    } catch { return null; }
  }

  ready(function () {
    const usernameInput = $('#tgUsername');
    if (usernameInput){
      usernameInput.addEventListener('input', () => {
        const v = usernameInput.value;
        const nv = normalizeWithAt(v);
        if (v !== nv){
          usernameInput.value = nv;
          try{ usernameInput.setSelectionRange(nv.length, nv.length); }catch{}
        }
      });
      usernameInput.addEventListener('blur', () => { if (usernameInput.value === '@') usernameInput.value = ''; });
      usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); usernameInput.blur(); } });
    }

    const starsAmount = $('#starsAmount');
    if (starsAmount){
      const digitsOnly = s => String(s || '').replace(/\D+/g, '');
      starsAmount.addEventListener('input', () => {
        const v = starsAmount.value;
        const nv = digitsOnly(v).slice(0,5); // до 20000 → 5 знаков
        if (v !== nv){
          starsAmount.value = nv;
          try{ starsAmount.setSelectionRange(nv.length, nv.length); }catch{}
        }
        updateTotal();
      });
      starsAmount.addEventListener('beforeinput', e => { if (e.inputType === 'insertText' && /\D/.test(e.data)) e.preventDefault(); });
      starsAmount.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); starsAmount.blur(); } });
    }

    // Пакеты
    const packsList   = $('#packsList');
    const packsToggle = $('#packsToggle');
    let activePackEl  = null;
    let suppressClear = false;

    if (packsList){
      packsList.querySelectorAll('.pack-item').forEach(btn => {
        const img  = btn.querySelector('.pack-icon img');
        const icon = btn.getAttribute('data-icon');
        if (img && icon) img.src = icon;
      });
    }

    packsToggle?.addEventListener('click', () => {
      const collapsed = packsList.getAttribute('data-collapsed') === 'true';
      packsList.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
      packsToggle.textContent = collapsed ? 'Свернуть список пакетов' : 'Показать все пакеты';
    });

    packsList?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pack-item');
      if (!btn) return;

      if (activePackEl && activePackEl !== btn){
        activePackEl.classList.remove('is-active');
        const oldImg  = activePackEl.querySelector('.pack-icon img');
        const oldIcon = activePackEl.getAttribute('data-icon');
        if (oldImg && oldIcon) oldImg.src = oldIcon;
      }

      const isActive = btn.classList.toggle('is-active');
      const img = btn.querySelector('.pack-icon img');

      if (isActive){
        activePackEl = btn;
        const act = btn.getAttribute('data-icon-active');
        if (img && act) img.src = act;

        const count = String(btn.getAttribute('data-stars') || '').replace(/\D+/g, '');
        if (count && starsAmount){
          suppressClear = true;
          starsAmount.value = count;
          starsAmount.dispatchEvent(new Event('input', { bubbles: true }));
          queueMicrotask(() => { suppressClear = false; });
        }
      } else {
        activePackEl = null;
        const def = btn.getAttribute('data-icon');
        if (img && def) img.src = def;
      }
    });

    starsAmount?.addEventListener('input', () => {
      if (suppressClear) return;
      if (!activePackEl) return;
      const img = activePackEl.querySelector('.pack-icon img');
      const def = activePackEl.getAttribute('data-icon');
      activePackEl.classList.remove('is-active');
      if (img && def) img.src = def;
      activePackEl = null;
    });

    // Итог
    const STARS_MIN = 50;
    const STARS_MAX = 20000;

    const nfRub2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const totalCard  = document.getElementById('totalCard');
    const totalValue = document.getElementById('totalValue');
    const starsEl    = document.getElementById('starsAmount');
    const payButtons = Array.from(document.querySelectorAll('#paySbpBtn, #payCryptoBtn'));

    function setPayEnabled(on){
      payButtons.forEach(btn => {
        if (!btn) return;
        btn.disabled = !on;
        btn.classList.toggle('is-disabled', !on);
        btn.setAttribute('aria-disabled', String(!on));
      });
    }

    function getStarRate(){
      const fromWin  = Number(window.STAR_RATE);
      if (!isNaN(fromWin) && fromWin > 0) return fromWin;
      const fromAttr = Number(totalCard?.dataset?.rate);
      if (!isNaN(fromAttr) && fromAttr > 0) return fromAttr;
      return 1.7;
    }

    function hasValidRecipient(){
      const v = (document.getElementById('tgUsername')?.value || '').trim();
      return /^@[A-Za-z0-9_]{1,32}$/.test(v);
    }

    function updateTotal(){
      const qty = Number((starsEl?.value || '').replace(/\D+/g, ''));
      const inRange = qty >= STARS_MIN && qty <= STARS_MAX;

      if (!inRange){
        if (totalValue) totalValue.textContent = '0';
        setPayEnabled(false);
        return;
      }

      const sum = qty * getStarRate();
      if (totalValue) totalValue.textContent = `${nfRub2.format(sum)} руб.`;

      const canPay = sum > 0 && hasValidRecipient();
      setPayEnabled(canPay);
    }

    starsEl?.addEventListener('input', updateTotal);
    document.getElementById('tgUsername')?.addEventListener('input', updateTotal);

    setPayEnabled(false);
    updateTotal();

    const buySelfBtn = $('#buyForMeBtn') || $('#buySelfBtn');
    if (buySelfBtn && usernameInput){
      buySelfBtn.addEventListener('click', () => {
        const me = getSelfUsername();
        if (!me){
          window.Telegram?.WebApp?.showToast?.('В вашем профиле Telegram не указан username');
          return;
        }
        usernameInput.value = '@' + me;
        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
        usernameInput.blur();
      });
    }

    function blurIfOutside(e){
      const ae = document.activeElement;
      if (!ae) return;
      const isInput = ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA';
      if (!isInput) return;
      if (ae.contains(e.target)) return;
      ae.blur();
    }
    document.addEventListener('pointerdown', blurIfOutside, { capture: true });
    document.addEventListener('touchstart',  blurIfOutside, { capture: true });
  });
})();

/* ========= Stars: фронт ↔ бэк ========= */
(function () {
  const API_BASE = "https://api.starsbox.org";
  const PRODUCT = "stars";
  const CURRENCY = "RUB";
  const MIN_STARS = 50;
  const MAX_STARS = 20000;

  const $  = (sel) => document.querySelector(sel);
  const tg = window.Telegram?.WebApp || null;

  const usernameInput = $("#tgUsername");
  const amountInput   = $("#starsAmount");
  const totalCard     = $("#totalCard");
  const totalValue    = $("#totalValue");
  const paySbpBtn     = $("#paySbpBtn");
  const payCryptoBtn  = $("#payCryptoBtn");

  const RATE = (() => {
    const raw = totalCard?.dataset?.rate || "1";
    const v = parseFloat(String(raw).replace(",", "."));
    return Number.isFinite(v) ? v : 1;
  })();

  const THANKS_SUCCESS = window.PAY_SUCCESS_URL;
  const THANKS_FAIL    = window.PAY_FAIL_URL;

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function normalizeUsername(v) {
    if (!v) return "";
    let s = String(v).trim();
    if (!s) return "";
    if (s.startsWith("@")) return s;
    if (/^[A-Za-z0-9_\.]+$/.test(s)) return "@" + s;
    return s;
  }

  function getQty() {
    const raw = amountInput?.value || "";
    const onlyDigits = raw.replace(/[^\d]/g, "");
    const n = parseInt(onlyDigits, 10);
    if (!Number.isFinite(n)) return 0;
    return clamp(n, MIN_STARS, MAX_STARS);
  }

  function updateTotal() {
    const qty = getQty();
    const amountRub = qty * RATE;
    const amountMinor = Math.round(amountRub * 100);
    if (totalValue){
      try {
        totalValue.textContent = qty
          ? new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(amountRub)
          : "0,00 руб.";
      } catch {
        totalValue.textContent = qty ? `${amountRub.toFixed(2)} руб.` : "0,00 руб.";
      }
      totalValue.dataset.amountMinor = String(amountMinor);
      totalValue.dataset.qty = String(qty);
    }
  }

  function setLoading(is) {
    [paySbpBtn, payCryptoBtn].forEach((b) => {
      if (!b) return;
      b.disabled = !!is;
      b.classList.toggle("is-loading", !!is);
      b.setAttribute('aria-disabled', String(!!is));
    });
  }

  function openLink(url) {
    if (!url) return;
    if (typeof window.openInsideTelegram === 'function') {
      try { window.openInsideTelegram(url); return; } catch {}
    }
    if (tg && typeof tg.openLink === "function") {
      try { tg.openLink(url); return; } catch {}
    }
    window.location.href = url;
  }

  async function initiatePayment(provider) {
    try {
      setLoading(true);

      const username = normalizeUsername(usernameInput?.value || "");
      if (!username || !/^@[A-Za-z0-9_]{1,32}$/.test(username)) {
        alert("Укажите корректный username получателя (например, @username).");
        return;
      }

      const qty = getQty();
      if (!qty || qty < MIN_STARS || qty > MAX_STARS) {
        alert(`Укажите количество звёзд от ${MIN_STARS} до ${MAX_STARS}.`);
        return;
      }

      const amountMinor = Number(totalValue?.dataset?.amountMinor || "0");
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
        alert("Сумма к оплате не рассчитана. Попробуйте выбрать пакет или ввести количество заново.");
        return;
      }

      const payload = {
        provider,                  // "wata" | "heleket"
        product: PRODUCT,          // "stars"
        username,                  // "@username"
        qty,                       // число звёзд
        amount_minor: amountMinor, // копейки
        currency: CURRENCY,        // "RUB"

        // реф-код только если есть (session-only)
        ref_code: (window.getRefCode && window.getRefCode()) || undefined,

        // плательщик для write-once привязки
        actor_tg_id: tg?.initDataUnsafe?.user?.id || undefined,

        // возврат в мини-апп (оба варианта имён — для совместимости)
        success_url: THANKS_SUCCESS,
        fail_url:    THANKS_FAIL,
        successUrl:  THANKS_SUCCESS,
        returnUrl:   THANKS_FAIL
      };

      const resp = await fetch(`${API_BASE}/pay/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status} ${resp.statusText} ${txt || ""}`.trim());
      }

      const data = await resp.json();
      if (!data || !data.ok || !data.payment_url) {
        throw new Error(`Некорректный ответ сервера: ${JSON.stringify(data)}`);
      }

      openLink(data.payment_url);
    } catch (e) {
      console.error("[pay/initiate] error:", e);
      alert(`Не удалось создать платёж.\n${e && e.message ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }

  function initPayButtons() {
    paySbpBtn?.addEventListener("click", () => initiatePayment("wata"));
    payCryptoBtn?.addEventListener("click", () => initiatePayment("heleket"));
  }

  function init() {
    try { tg?.ready?.(); } catch {}
    updateTotal();
    initPayButtons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
