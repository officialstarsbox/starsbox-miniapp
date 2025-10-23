/* ========= REF BOOTSTRAP (одноразовый) ========= */
(function () {
  const KEY = "sb_ref_code_v1";
  const TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 дней

  function save(rc){
    if(!rc) return;
    try{
      localStorage.setItem(KEY, JSON.stringify({ rc:String(rc), ts: Date.now() }));
    }catch{}
  }
  function read(){
    try{
      const item = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!item) return null;
      if (Date.now() - Number(item.ts||0) > TTL_MS) { localStorage.removeItem(KEY); return null; }
      return item.rc || null;
    }catch{ return null; }
  }

  function normalize(s){
    if (!s) return null;
    let v = String(s).trim();
    if (!v) return null;
    // поддерживаем "ref:XXXX", "r:XXXX", "rXXXX", просто "XXXX"
    if (v.startsWith("ref:")) v = v.slice(4);
    if (v.startsWith("r:"))   v = v.slice(2);
    if (v.startsWith("r") && /^[a-z0-9]+$/i.test(v.slice(1))) v = v.slice(1);
    return v || null;
  }

  function fromStartParam(){
    try{
      const tg = window.Telegram && window.Telegram.WebApp;
      const sp = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
      return normalize(sp);
    }catch{ return null; }
  }
  function fromUrl(){
    try{
      const q = new URLSearchParams(location.search);
      const raw = q.get("rc") || q.get("ref") || q.get("startapp") || q.get("start_app");
      return normalize(raw);
    }catch{ return null; }
  }

  const rc = fromStartParam() || fromUrl();
  if (rc) save(rc);

  window.getRefCode = () => read();
  window.clearRefCode = () => { try{ localStorage.removeItem(KEY); }catch{} };
})();

/* ========= UI / валидация ========= */
(function () {
  // ---------- helpers ----------
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $ = (s, r) => (r || document).querySelector(s);

  // нормализация username: только [A-Za-z0-9_], до 32, и лидирующий '@'
  function normalizeWithAt(raw){
    const core = String(raw || '').replace(/@/g,'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,32);
    return core ? '@' + core : '';
  }

  // username из Telegram WebApp или ?tg_username=... (для локальных тестов)
  function getSelfUsername(){
    const tg = window.Telegram && window.Telegram.WebApp;
    tg?.ready?.();
    const u = tg?.initDataUnsafe?.user?.username;
    if (u) return String(u).replace(/[^a-zA-Z0-9_]/g,'').slice(0,32);
    try{
      const q = new URLSearchParams(location.search).get('tg_username');
      return q ? String(q).replace(/[^a-zA-Z0-9_]/g,'').slice(0,32) : null;
    }catch{ return null; }
  }

  ready(function () {
    // ===== username =====
    const usernameInput = $('#tgUsername');
    if (usernameInput){
      usernameInput.addEventListener('input', () => {
        const v = usernameInput.value;
        const nv = normalizeWithAt(v);
        if (v !== nv){
          usernameInput.value = nv;
          try{ usernameInput.setSelectionRange(nv.length, nv.length); }catch(e){}
        }
      });
      usernameInput.addEventListener('blur', () => {
        if (usernameInput.value === '@') usernameInput.value = '';
      });
      usernameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter'){ e.preventDefault(); usernameInput.blur(); }
      });
    }

    // ===== stars amount — только цифры =====
    const starsAmount = $('#starsAmount');
    if (starsAmount){
      const digitsOnly = s => String(s || '').replace(/\D+/g, '');
      starsAmount.addEventListener('input', () => {
        const v = starsAmount.value;
        const nv = digitsOnly(v).slice(0,5); // максимум 20000 → 5 знаков
        if (v !== nv){
          starsAmount.value = nv;
          try{ starsAmount.setSelectionRange(nv.length, nv.length); }catch(e){}
        }
        updateTotal(); // поддерживаем "Итого"
      });
      starsAmount.addEventListener('beforeinput', e => {
        if (e.inputType === 'insertText' && /\D/.test(e.data)) e.preventDefault();
      });
      starsAmount.addEventListener('keydown', e => {
        if (e.key === 'Enter'){ e.preventDefault(); starsAmount.blur(); }
      });
    }

    // ===== Пакеты =====
    const packsList   = $('#packsList');
    const packsToggle = $('#packsToggle');
    let activePackEl  = null;
    let suppressClear = false; // чтобы не сбрасывать активный пакет при программной подстановке

    // Проставим иконки из data-атрибутов
    if (packsList){
      packsList.querySelectorAll('.pack-item').forEach(btn => {
        const img  = btn.querySelector('.pack-icon img');
        const icon = btn.getAttribute('data-icon');
        if (img && icon) img.src = icon;
      });
    }

    // Переключение развёрнутого списка
    packsToggle?.addEventListener('click', () => {
      const collapsed = packsList.getAttribute('data-collapsed') === 'true';
      packsList.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
      packsToggle.textContent = collapsed ? 'Свернуть список пакетов' : 'Показать все пакеты';
      // Кнопка автоматически «уедет» вниз, т.к. стоит после списка
    });

    // Выбор пакета
    packsList?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pack-item');
      if (!btn) return;

      // Снять активность с предыдущего
      if (activePackEl && activePackEl !== btn){
        activePackEl.classList.remove('is-active');
        const oldImg  = activePackEl.querySelector('.pack-icon img');
        const oldIcon = activePackEl.getAttribute('data-icon');
        if (oldImg && oldIcon) oldImg.src = oldIcon;
      }

      // Тоггл текущего
      const isActive = btn.classList.toggle('is-active');
      const img = btn.querySelector('.pack-icon img');

      if (isActive){
        activePackEl = btn;
        // заменить иконку на активную
        const act = btn.getAttribute('data-icon-active');
        if (img && act) img.src = act;

        // подставить кол-во звёзд в инпут
        const count = String(btn.getAttribute('data-stars') || '').replace(/\D+/g, '');
        if (count && starsAmount){
          suppressClear = true;
          starsAmount.value = count;
          starsAmount.dispatchEvent(new Event('input', { bubbles: true }));
          queueMicrotask(() => { suppressClear = false; });
        }
      } else {
        // вернули в неактивное состояние
        activePackEl = null;
        const def = btn.getAttribute('data-icon');
        if (img && def) img.src = def;
      }
    });

    // Любой ручной ввод — сбрасывает выбранный пакет
    starsAmount?.addEventListener('input', () => {
      if (suppressClear) return; // программная подстановка
      if (!activePackEl) return;
      const img = activePackEl.querySelector('.pack-icon img');
      const def = activePackEl.getAttribute('data-icon');
      activePackEl.classList.remove('is-active');
      if (img && def) img.src = def;
      activePackEl = null;
    });

    // ===== Итоговая стоимость + валидация и включение оплаты по username =====
    const STARS_MIN = 50;
    const STARS_MAX = 20000;

    const nfRub2 = new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

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

    // пересчёт при изменении количества И при изменении получателя
    starsEl?.addEventListener('input', updateTotal);
    document.getElementById('tgUsername')?.addEventListener('input', updateTotal);

    // первичная инициализация
    setPayEnabled(false);
    updateTotal();

    // ===== «Купить себе» — username берём в момент клика =====
    const buySelfBtn = $('#buyForMeBtn') || $('#buySelfBtn');
    if (buySelfBtn && usernameInput){
      buySelfBtn.addEventListener('click', () => {
        const me = getSelfUsername(); // ← каждый клик заново
        if (!me){
          window.Telegram?.WebApp?.showToast?.('В вашем профиле Telegram не указан username');
          return;
        }
        usernameInput.value = '@' + me;
        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
        usernameInput.blur();
      });
    }

    // ===== Сворачиваем клавиатуру по тапу вне инпута =====
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

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  // Элементы
  const usernameInput = $("#tgUsername");
  const amountInput = $("#starsAmount");
  const totalCard = $("#totalCard");
  const totalValue = $("#totalValue");
  const packsList = $("#packsList");
  const packsToggle = $("#packsToggle");
  const paySbpBtn = $("#paySbpBtn");
  const payCryptoBtn = $("#payCryptoBtn");
  const buyForMeBtn = $("#buyForMeBtn");

  // Ставка ₽ за звезду (берём из data-rate на карточке)
  const RATE = (() => {
    const raw = totalCard?.dataset?.rate || "1";
    const v = parseFloat(String(raw).replace(",", "."));
    return Number.isFinite(v) ? v : 1;
  })();

  // ✅ адреса возврата в мини-апп после оплаты (страницы “спасибо”/“ошибка”)
  const THANKS_SUCCESS = window.PAY_SUCCESS_URL;
  const THANKS_FAIL    = window.PAY_FAIL_URL;

  // Утилиты
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function normalizeUsername(v) {
    if (!v) return "";
    let s = String(v).trim();
    if (!s) return "";
    if (s.startsWith("@")) return s;
    // Разрешим латиницу, цифры, подчёркивания и точки
    if (/^[A-Za-z0-9_\.]+$/.test(s)) return "@" + s;
    // Если там что-то странное, оставим как есть (пускай бэк отфейлит валидатором)
    return s;
  }

  function formatRub(num) {
    try {
      return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(num);
    } catch {
      return `${(Math.round(num * 100) / 100).toFixed(2)} руб.`;
    }
  }

  function getQty() {
    const raw = amountInput?.value || "";
    const onlyDigits = raw.replace(/[^\d]/g, "");
    const n = parseInt(onlyDigits, 10);
    if (!Number.isFinite(n)) return 0;
    return clamp(n, MIN_STARS, MAX_STARS);
  }

  function setQty(n) {
    const v = clamp(Number(n) || 0, MIN_STARS, MAX_STARS);
    amountInput.value = v ? String(v) : "";
    updateTotal();
  }

  function updateTotal() {
    const qty = getQty();
    const amountRub = qty * RATE;               // ₽
    const amountMinor = Math.round(amountRub * 100); // копейки, целое

    totalValue.textContent = qty ? formatRub(amountRub) : "0,00 руб.";
    totalValue.dataset.amountMinor = String(amountMinor);
    totalValue.dataset.qty = String(qty);
  }

  function setLoading(is) {
    [paySbpBtn, payCryptoBtn, packsToggle].forEach((b) => {
      if (!b) return;
      b.disabled = !!is;
      b.classList.toggle("is-loading", !!is);
    });
  }

  // ✅ открыть ссылку строго внутри Telegram (если возможно)
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
      if (!username) {
        alert("Укажите username получателя (например, @username).");
        return;
      }

      const qty = getQty();
      if (!qty || qty < MIN_STARS || qty > MAX_STARS) {
        alert(`Укажите количество звёзд от ${MIN_STARS} до ${MAX_STARS}.`);
        return;
      }

      const amountMinor = Number(totalValue.dataset.amountMinor || "0");
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

        // 🔗 реф-код из localStorage/URL/TG start_param
        ref_code: (window.getRefCode && window.getRefCode()) || null,

        // 👤 кто платит (для «липкой» привязки на бэке)
        actor_tg_id: tg?.initDataUnsafe?.user?.id || null,

        // ✅ адреса возврата (бэку и/или провайдеру)
        successUrl: THANKS_SUCCESS,
        returnUrl:  THANKS_FAIL,
        success_url: THANKS_SUCCESS, // дублируем в snake_case на всякий случай
        fail_url:    THANKS_FAIL
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
      // ожидаем формат: { ok:true, orderId:"...", payment_url:"...", status:"pending" }
      if (!data || !data.ok || !data.payment_url) {
        throw new Error(`Некорректный ответ сервера: ${JSON.stringify(data)}`);
      }

      // открываем платёжную ссылку внутри мини-аппа
      openLink(data.payment_url);
    } catch (e) {
      console.error("[pay/initiate] error:", e);
      alert(`Не удалось создать платёж.\n${e && e.message ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }

  // === Пакеты ===
  function initPacks() {
    const packsList = $("#packsList");
    if (!packsList) return;
    const btns = $$(".pack-item");

    // Проставим иконки (обычная/активная)
    btns.forEach((btn) => {
      const img = btn.querySelector(".pack-icon img");
      if (!img) return;
      const icon = btn.dataset.icon || "";
      img.src = icon;
    });

    function selectPack(btn) {
      btns.forEach((b) => {
        const img = b.querySelector(".pack-icon img");
        const icon = b.dataset.icon || "";
        const iconActive = b.dataset.iconActive || icon;
        if (b === btn) {
          b.classList.add("is-selected");
          b.setAttribute("aria-pressed", "true");
          if (img) img.src = iconActive;
        } else {
          b.classList.remove("is-selected");
          b.setAttribute("aria-pressed", "false");
          if (img) img.src = icon;
        }
      });
    }

    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const stars = parseInt(btn.dataset.stars || "0", 10) || 0;
        selectPack(btn);
        if (stars) setQty(stars);
      });
    });
  }

  // === Prefill: «купить себе» ===
  function initBuyForMe() {
    const buyForMeBtn = $("#buyForMeBtn");
    const usernameInput = $("#tgUsername");
    const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
    if (!buyForMeBtn || !usernameInput) return;
    buyForMeBtn.addEventListener("click", () => {
      let u = "";
      try {
        const tgUser = tg?.initDataUnsafe?.user;
        if (tgUser?.username) u = "@" + tgUser.username;
      } catch {}
      if (!u) {
        // как fallback — пробуем данные из URL (?u=username)
        const url = new URL(window.location.href);
        const qU = url.searchParams.get("u");
        if (qU) u = normalizeUsername(qU);
      }
      if (!u) {
        alert("Не удалось определить ваш username из Telegram. Введите его вручную (например, @username).");
        usernameInput.focus();
        return;
      }
      usernameInput.value = u;
    });
  }

  // === Слушатели инпутов ===
  function initInputs() {
    if (amountInput) {
      amountInput.addEventListener("input", () => {
        // только цифры
        const digits = amountInput.value.replace(/[^\d]/g, "");
        amountInput.value = digits;
        updateTotal();
      });
      amountInput.addEventListener("blur", () => {
        // при потере фокуса — зажать в диапазон
        setQty(getQty());
      });
    }

    if (usernameInput) {
      usernameInput.addEventListener("blur", () => {
        const n = normalizeUsername(usernameInput.value);
        usernameInput.value = n;
      });
    }
  }

  // === Оплата (кнопки) ===
  function initPayButtons() {
    const paySbpBtn = $("#paySbpBtn");
    const payCryptoBtn = $("#payCryptoBtn");
    if (paySbpBtn) {
      paySbpBtn.addEventListener("click", () => initiatePayment("wata"));
    }
    if (payCryptoBtn) {
      payCryptoBtn.addEventListener("click", () => initiatePayment("heleket"));
    }
  }

  // === Автоинициализация на загрузке ===
  function init() {
    try { tg && tg.ready && tg.ready(); } catch {}
    initPacks();
    initBuyForMe();
    initInputs();
    updateTotal(); // на старте показать 0 ₽
    initPayButtons();
  }

  // DOM готов?
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
