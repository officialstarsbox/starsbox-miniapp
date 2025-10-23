/* ========= REF BOOTSTRAP (polyfill-only) ========= */
(function () {
  // если глобальный app.js уже дал getRefCode — выходим и не трогаем ничего
  if (typeof window.getRefCode === 'function') return;

  const KEY = "sb_ref_code"; // унифицируем ключ с app.js
  const TTL_MS = 1000 * 60 * 60 * 24 * 365; // 1 год, как в app.js
  const REF_RE = /^r[0-9a-z]{1,31}$/;       // тот же формат, что на бэке

  function save(rc){
    try{
      if (!REF_RE.test(String(rc||'').toLowerCase())) return;
      localStorage.setItem(KEY, String(rc).toLowerCase());
      document.cookie = `sb_ref=${String(rc).toLowerCase()}; Path=/; Max-Age=${60*60*24*365}; SameSite=Lax`;
    }catch{}
  }
  function read(){
    try{
      const ls = localStorage.getItem(KEY);
      if (REF_RE.test(String(ls||''))) return String(ls).toLowerCase();
      const m = document.cookie.match(/(?:^|;\s*)sb_ref=([^;]+)/);
      if (m && REF_RE.test(m[1])) return m[1].toLowerCase();
    }catch{}
    return null;
  }

  function normalize(raw){
    if (!raw) return null;
    let v = String(raw).trim().toLowerCase();
    if (v.startsWith("ref:")) v = v.slice(4).trim();
    if (v.startsWith("r:"))   v = v.slice(2).trim();
    if (v.startsWith("r") && /^[0-9a-z]+$/.test(v.slice(1))) v = v; // уже норм
    // итоговая проверка
    return REF_RE.test(v) ? v : null;
  }

  function fromStartParam(){
    try{
      const tg = window.Telegram && window.Telegram.WebApp;
      const sp = tg?.initDataUnsafe?.start_param;
      return normalize(sp);
    }catch{ return null; }
  }
  function fromUrl(){
  try{
    const q = new URLSearchParams(location.search);
    const raw =
      q.get("ref") ||
      q.get("rc") ||
      q.get("startapp") ||
      q.get("start_app") ||
      q.get("tgWebAppStartParam") ||
      q.get("tgwebappstartparam");
    return normalize(raw);
  }catch{ return null; }
}

  function bootstrapOnce(){
    const rc = fromStartParam() || fromUrl();
    if (rc) save(rc);
  }

  // первый проход — как и было
  bootstrapOnce();

  // отдаём API: если в LS пусто, пробуем прочитать свежий start_param/URL прямо сейчас
  window.getRefCode = () => {
    const v = read();
    if (v) return v;
    const fresh = fromStartParam() || fromUrl();
    if (fresh) { save(fresh); return fresh; }
    return null;
  };

})();

(function () {
  // ---------- helpers ----------
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  const $ = (s, r) => (r || document).querySelector(s);

  // Показ текста в карточке подарка (используется дальше)
  window.setGiftDescription = function setGiftDescription(text){
    const el = document.getElementById('giftDesc');
    if (!el) return;
    el.textContent = String(text || '').trim();
  };

  // ---------- init ----------
  ready(() => {
    // Инициализация описания (query → data-default → текущий)
    const descEl = $('#giftDesc');
    if (descEl){
      const q = new URLSearchParams(location.search).get('desc');
      const txt = q ? decodeURIComponent(q) : (descEl.dataset.default || descEl.textContent);
      setGiftDescription(txt);
    }
  });

  // ---------- username получателя ----------
  function normalizeWithAt(raw){
    const core = String(raw || '')
      .replace(/@/g, '')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 32);
    return core ? '@' + core : '';
  }
  function getSelfUsername(){
    const tg = window.Telegram && window.Telegram.WebApp;
    tg?.ready?.();
    const u = tg?.initDataUnsafe?.user?.username;
    if (u) return String(u).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
    try{
      const q = new URLSearchParams(location.search).get('tg_username');
      return q ? String(q).replace(/[^a-zA-Z0-9_]/g,'').slice(0,32) : null;
    }catch{ return null; }
  }

  ready(() => {
    const usernameInput = $('#tgUsername');

    if (usernameInput){
      usernameInput.addEventListener('input', () => {
        const nv = normalizeWithAt(usernameInput.value);
        if (usernameInput.value !== nv){
          usernameInput.value = nv;
          try{ usernameInput.setSelectionRange(nv.length, nv.length); }catch(e){}
        }
      });
      usernameInput.addEventListener('blur', () => {
        if (usernameInput.value === '@') usernameInput.value = '';
      });
      usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){ e.preventDefault(); usernameInput.blur(); }
      });
    }

    const buySelfBtn = $('#buyForMeBtn');
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

    // Сворачивание клавиатуры по тапу вне инпута/текстовой области
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

  // ---------- Отправитель + Сообщение (счётчики и текст карточки) ----------
  ready(() => {
    const descEl       = document.getElementById('giftDesc');
    if (!descEl) return;

    const defaultDesc  = descEl.dataset.default || descEl.textContent || '';

    const senderInput   = document.getElementById('senderInput');   // max 24
    const senderCount   = document.getElementById('senderCount');
    const messageInput  = document.getElementById('messageInput');  // max 91
    const messageCount  = document.getElementById('messageCount');

    const clamp = (s, max) => String(s || '').slice(0, max);

    function updateCounters(){
      if (senderInput && senderCount)   senderCount.textContent  = (senderInput.value  || '').length;
      if (messageInput && messageCount) messageCount.textContent = (messageInput.value || '').length;
    }

    // Сборка текста карточки:
    //  - если есть и отправитель, и сообщение → перенос строки между ними
    //  - если только одно из полей — выводим его
    //  - если пусто — дефолт
    function renderCardText(){
      const s = (senderInput?.value || '').trim();
      const m = (messageInput?.value || '').trim();

      if (s && m){
        setGiftDescription(`Отправитель: ${s} | ${m}`);
      } else if (s){
        setGiftDescription(`Отправитель: ${s}`);
      } else if (m){
        setGiftDescription(m);
      } else {
        setGiftDescription(defaultDesc);
      }
    }

    // Отправитель
    if (senderInput){
      senderInput.addEventListener('input', () => {
        const nv = clamp(senderInput.value, 24);
        if (nv !== senderInput.value){
          senderInput.value = nv;
          try{ senderInput.setSelectionRange(nv.length, nv.length); }catch(e){}
        }
        updateCounters();
        renderCardText();
      });
      senderInput.addEventListener('beforeinput', (e) => {
        if (e.inputType === 'insertText'){
          const sel = senderInput.selectionEnd - senderInput.selectionStart;
          if (senderInput.value.length >= 24 && sel === 0) e.preventDefault();
        }
      });
    }

    // Сообщение
    if (messageInput){
      messageInput.addEventListener('input', () => {
        const nv = clamp(messageInput.value, 91);
        if (nv !== messageInput.value){
          messageInput.value = nv;
          try{ messageInput.setSelectionRange(nv.length, nv.length); }catch(e){}
        }
        updateCounters();
        renderCardText();
      });
      messageInput.addEventListener('beforeinput', (e) => {
        if (e.inputType === 'insertText'){
          const sel = messageInput.selectionEnd - messageInput.selectionStart;
          if (messageInput.value.length >= 91 && sel === 0) e.preventDefault();
        }
      });
    }

    // первичный рендер
    updateCounters();
    renderCardText();
  });
})();

// ===== ИТОГО К ОПЛАТЕ + активация кнопок =====
(function () {
  const totalEl   = document.getElementById('totalValue');
  const totalCard = document.getElementById('totalCard');
  const unameEl   = document.getElementById('tgUsername');
  const payBtns   = [document.getElementById('paySbpBtn'), document.getElementById('payCryptoBtn')].filter(Boolean);

  if (!totalEl) return;

  // 1) Цена подарка: data-атрибут → query (?price=) → текст в #totalValue (например "25,00 руб.")
  function getGiftPrice() {
    // data-price на карточке итога (желательно так и делать)
    const fromData = Number(totalCard?.dataset?.price);
    if (!Number.isNaN(fromData) && fromData > 0) return fromData;

    // ?price= в URL
    const q = new URLSearchParams(location.search).get('price');
    const fromQuery = Number(q?.replace(',', '.'));
    if (!Number.isNaN(fromQuery) && fromQuery > 0) return fromQuery;

    // парсим то, что уже отрендерено в #totalValue
    const raw = (totalEl.textContent || '').replace(/[^\d,.-]/g, '').replace(',', '.');
    const fromText = parseFloat(raw);
    return Number.isFinite(fromText) ? fromText : 0;
  }

  // 2) Валиден ли получатель (@ + 1..32 символов [A-Za-z0-9_])
  function hasValidRecipient() {
    const v = (unameEl?.value || '').trim();
    return /^@[A-Za-z0-9_]{1,32}$/.test(v);
  }

  // 3) Включение/выключение кнопок
  function updatePayButtons() {
    const enabled = getGiftPrice() > 0 && hasValidRecipient();
    payBtns.forEach(b => {
      b.disabled = !enabled;
      b.setAttribute('aria-disabled', String(!enabled));
    });
  }

  // 4) Отрисовка суммы (если нужно привести формат) + первичное состояние кнопок
  const nfRub2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function renderTotal() {
    const price = getGiftPrice();
    totalEl.textContent = `${nfRub2.format(price)} руб.`;
    updatePayButtons();
  }

  // Слушаем изменения получателя (в т.ч. при «купить себе», т.к. там диспатчится 'input')
  unameEl?.addEventListener('input', updatePayButtons);

  // Первичный рендер
  renderTotal();
})();

// Универсально читаем username пользователя из Telegram или из ?tg_username
function readSelfUsername(){
  try{
    const tg = window.Telegram && window.Telegram.WebApp;
    tg?.ready?.();
    const u = tg?.initDataUnsafe?.user?.username;
    if (u) return String(u).trim();
  }catch{}

  // локальная отладка: /page.html?tg_username=YourName
  try{
    const q = new URLSearchParams(location.search).get('tg_username');
    if (q) return String(q).trim();
  }catch{}

  return null;
}

// мягкий показ тоста (если есть API)
function toast(msg){
  window.Telegram?.WebApp?.showToast?.(msg);
}

// ===== «Купить себе» (подставить @username в поле получателя) =====
(function(){
  const btn   = document.getElementById('buyForMeBtn');
  const input = document.getElementById('tgUsername');
  if (!btn || !input) return;

  btn.addEventListener('click', () => {
    const me = readSelfUsername();
    if (!me){ toast('В вашем профиле Telegram не указан username'); return; }

    // нормализация как на странице со звёздами
    const core = me.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
    input.value = core ? '@' + core : '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });
})();

// ===== «указать мой юзернейм» (в поле Отправитель, лимит 24) =====
(function(){
  const btn   = document.getElementById('fillMyUsernameBtn');
  const input = document.getElementById('senderInput');
  if (!btn || !input) return;

  btn.addEventListener('click', () => {
    const me = readSelfUsername();
    if (!me){ toast('В вашем профиле Telegram не указан username'); return; }

    // поле отправителя допускает любые символы, но мы вставляем корректный @username
    const val = '@' + me.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 23); // 1 символ уже займёт '@'
    input.value = val.slice(0, 24);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });
})();

/* ========= Подарки: фронт ↔ бэк ========= */
(function () {
  const API_BASE = "https://api.starsbox.org";
  const PRODUCT  = "gift";
  const CURRENCY = "RUB";

  const $  = (sel) => document.querySelector(sel);
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  // Элементы
  const giftCard      = $("#giftCard");
  const giftDescEl    = $("#giftDesc");
  const usernameInput = $("#tgUsername");
  const buyForMeBtn   = $("#buyForMeBtn");

  const senderInput   = $("#senderInput");
  const senderCount   = $("#senderCount");
  const fillMyBtn     = $("#fillMyUsernameBtn");

  const messageInput  = $("#messageInput");
  const messageCount  = $("#messageCount");

  const totalValueEl  = $("#totalValue");
  const paySbpBtn     = $("#paySbpBtn");
  const payCryptoBtn  = $("#payCryptoBtn");

  /* ---------- helpers ---------- */
  function normalizeUsername(v) {
    if (!v) return "";
    let s = String(v).trim();
    if (!s) return "";
    if (s.startsWith("@")) return s;
    if (/^[A-Za-z0-9_\.]+$/.test(s)) return "@" + s;
    return s;
  }

  function formatRub(num) {
    try {
      return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(num);
    } catch {
      return `${(Math.round(num * 100) / 100).toFixed(2)} руб.`;
    }
  }

  function setLoading(is) {
    [paySbpBtn, payCryptoBtn].forEach((b) => {
      if (!b) return;
      b.disabled = !!is;
      b.classList.toggle("is-loading", !!is);
      b.setAttribute("aria-disabled", String(!!is));
    });
  }

  function enablePayButtons(enable) {
    [paySbpBtn, payCryptoBtn].forEach((b) => {
      if (!b) return;
      b.disabled = !enable;
      b.setAttribute("aria-disabled", String(!enable));
    });
  }

  // ✅ открыть ссылку строго внутри Telegram мини-аппа
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

  /* ---------- meta подарка ---------- */
  function getGiftMeta() {
    // gift_id берём из data-gift-id и ОСТАВЛЯЕМ СТРОКОЙ (чтобы не терять точность)
    let gift_id = null;
    if (giftCard?.dataset?.giftId) {
      gift_id = String(giftCard.dataset.giftId).trim();
    }

    // цена: data-price -> текст "Итого"
    let priceRub = NaN;
    if (giftCard?.dataset?.price) {
      const v = parseFloat(String(giftCard.dataset.price).replace(",", "."));
      if (Number.isFinite(v) && v > 0) priceRub = v;
    }
    if (!Number.isFinite(priceRub) || priceRub <= 0) {
      const raw = (totalValueEl?.textContent || "").replace(/[^\d,.-]/g, "").replace(",", ".");
      const p = parseFloat(raw);
      if (Number.isFinite(p) && p > 0) priceRub = p;
    }
    if (!Number.isFinite(priceRub) || priceRub <= 0) priceRub = 25;

    return { gift_id, priceRub };
  }

  /* ---------- итоговый текст ---------- */
  function buildGiftText() {
    const sender = (senderInput?.value || "").trim();
    const msg    = (messageInput?.value || "").trim();
    if (sender && msg) return `Отправитель: ${sender} | ${msg}`;
    if (sender)        return `Отправитель: ${sender}`;
    if (msg)           return msg;
    return giftDescEl?.dataset?.default || "Сообщение для получателя";
  }

  function refreshGiftDesc() {
    if (giftDescEl) giftDescEl.textContent = buildGiftText();
  }

  function refreshCounters() {
    if (senderCount && senderInput)   senderCount.textContent  = String(senderInput.value.length);
    if (messageCount && messageInput) messageCount.textContent = String(messageInput.value.length);
  }

  function refreshTotal() {
    const { priceRub } = getGiftMeta();
    const minor = Math.round(priceRub * 100);
    if (totalValueEl) {
      totalValueEl.textContent = formatRub(priceRub);
      totalValueEl.dataset.amountMinor = String(minor);
    }
  }

  function refreshPayState() {
    const username    = normalizeUsername(usernameInput?.value || "");
    const { gift_id } = getGiftMeta();               // <-- тут именно gift_id
    const amountMinor = Number(totalValueEl?.dataset?.amountMinor || "0");
    const enable      = !!username && !!gift_id && Number.isInteger(amountMinor) && amountMinor > 0;
    enablePayButtons(enable);
  }

  /* ---------- действие: создать платёж ---------- */
  async function initiatePayment(provider) {
    try {
      setLoading(true);

      const username = normalizeUsername(usernameInput?.value || "");
      if (!username) {
        alert("Укажите username получателя (например, @username).");
        return;
      }

      const { gift_id } = getGiftMeta();
      if (!gift_id) {
        alert("Не указан gift_id у подарка. Добавьте data-gift-id на #giftCard.");
        return;
      }

      const amountMinor = Number(totalValueEl?.dataset?.amountMinor || "0");
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
        alert("Сумма к оплате не рассчитана.");
        return;
      }

      // кто платит — для честного реф-зачёта
      const actorId = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) ? tg.initDataUnsafe.user.id : null;
      
      function readRefCodeSafe(){
        try {
          const v1 = (typeof window.getRefCode === 'function') ? window.getRefCode() : null;
          if (v1) return v1;
          // последняя попытка: прямо из Telegram и URL
          const tg = window.Telegram && window.Telegram.WebApp;
          const sp = tg?.initDataUnsafe?.start_param || '';
          const qs = new URLSearchParams(location.search);
          const raw = sp || qs.get('ref') || qs.get('rc') || qs.get('startapp') || qs.get('start_app') || '';
          const v = String(raw).trim().toLowerCase().replace(/^ref:\s*/,'').replace(/^r:\s*/,'');
          return /^r[0-9a-z]{1,31}$/.test(v) ? v : null;
        } catch { return null; }
      }

      const THANKS_SUCCESS = window.PAY_SUCCESS_URL;
      const THANKS_FAIL    = window.PAY_FAIL_URL;

      const payload = {
        provider,
        product: "gift",
        tg_username: username,        // получатель (как и раньше)
        qty: 1,
        amount_minor: amountMinor,
        currency: "RUB",
        gift_id,                      // строкой, без Number()
        gift_text: buildGiftText(),

        // 🔗 рефералка + плательщик
        ref_code: readRefCodeSafe(),
        actor_tg_id: actorId,

        // ✅ вернуть пользователя в мини-апп
        successUrl: THANKS_SUCCESS,
        returnUrl:  THANKS_FAIL,
        success_url: THANKS_SUCCESS,  // дубль в snake_case — на всякий случай
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
      if (!data || !data.ok || !data.payment_url) {
        throw new Error(`Некорректный ответ сервера: ${JSON.stringify(data)}`);
      }
      openLink(data.payment_url);
    } catch (e) {
      console.error("[pay/initiate gift] error:", e);
      alert(`Не удалось создать платёж.\n${e && e.message ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }

  /* ---------- init UI ---------- */
  function initBuyForMe() {
    if (!buyForMeBtn || !usernameInput) return;
    buyForMeBtn.addEventListener("click", () => {
      let u = "";
      try { const tgUser = tg?.initDataUnsafe?.user; if (tgUser?.username) u = "@" + tgUser.username; } catch {}
      if (!u) {
        const url = new URL(window.location.href);
        const qU = url.searchParams.get("u");
        if (qU) u = normalizeUsername(qU);
      }
      if (!u) { alert("Не удалось определить ваш username из Telegram. Введите его вручную (например, @username)."); usernameInput.focus(); return; }
      usernameInput.value = u;
      refreshPayState();
    });
  }

  function initFillMyUsername() {
    if (!fillMyBtn || !senderInput) return;
    fillMyBtn.addEventListener("click", () => {
      let u = "";
      try { const tgUser = tg?.initDataUnsafe?.user; if (tgUser?.username) u = "@" + tgUser.username; } catch {}
      if (!u) {
        const url = new URL(window.location.href);
        const qU = url.searchParams.get("me");
        if (qU) u = normalizeUsername(qU);
      }
      if (!u) { alert("Не удалось взять ваш username из Telegram. Введите его вручную (например, @username)."); senderInput.focus(); return; }
      senderInput.value = u;
      refreshCounters();
      refreshGiftDesc();
    });
  }

  function initInputs() {
    usernameInput?.addEventListener("blur",  () => { usernameInput.value = normalizeUsername(usernameInput.value); refreshPayState(); });
    usernameInput?.addEventListener("input", refreshPayState);

    senderInput?.addEventListener("input",  () => { refreshCounters(); refreshGiftDesc(); });
    messageInput?.addEventListener("input", () => { refreshCounters(); refreshGiftDesc(); });
  }

  function initPayButtons() {
    paySbpBtn  && paySbpBtn.addEventListener("click",  () => initiatePayment("wata"));
    payCryptoBtn && payCryptoBtn.addEventListener("click", () => initiatePayment("heleket"));
  }

  function init() {
    try { tg && tg.ready && tg.ready(); } catch {}
    refreshTotal();
    refreshCounters();
    refreshGiftDesc();
    refreshPayState();
    initBuyForMe();
    initFillMyUsername();
    initInputs();
    initPayButtons();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

