// ============= gifts/app.js (упрощённый и согласованный с бэком) =============
(function () {
  const API_BASE = "https://api.starsbox.org";
  const PRODUCT  = "gift";
  const CURRENCY = "RUB";

  const $ = (s, r) => (r || document).querySelector(s);
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  // --- DOM ---
  const giftCard      = $("#giftCard");       // data-gift-id, data-price (RUB)
  const totalCard     = $("#totalCard");      // fallback для цены: data-price
  const totalValueEl  = $("#totalValue");     // человекочитаемая сумма
  const giftDescEl    = $("#giftDesc");       // текст на карточке (data-default)
  const usernameInput = $("#tgUsername");

  const senderInput   = $("#senderInput");    // до 24 символов (произвольных)
  const senderCount   = $("#senderCount");
  const messageInput  = $("#messageInput");   // до 91 символа
  const messageCount  = $("#messageCount");

  const buyForMeBtn   = $("#buyForMeBtn");
  const fillMyBtn     = $("#fillMyUsernameBtn");
  const paySbpBtn     = $("#paySbpBtn");
  const payCryptoBtn  = $("#payCryptoBtn");

  // --- helpers ---
  function normalizeWithAt(raw){
    const core = String(raw||'').replace(/@/g,'').replace(/[^A-Za-z0-9_]/g,'').slice(0,32);
    return core ? '@'+core : '';
  }
  function formatRub(num) {
    try {
      return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(num);
    } catch { return `${(Math.round(num * 100) / 100).toFixed(2)} руб.`; }
  }
  function openLink(url) {
    if (!url) return;
    if (typeof window.openInsideTelegram === "function") { try { window.openInsideTelegram(url); return; } catch {} }
    if (tg && typeof tg.openLink === "function")        { try { tg.openLink(url); return; } catch {} }
    location.href = url;
  }
  function setLoading(is) {
    [paySbpBtn, payCryptoBtn].forEach(b => {
      if (!b) return;
      b.disabled = !!is;
      b.classList.toggle("is-loading", !!is);
      b.setAttribute("aria-disabled", String(!!is));
    });
  }
  function enablePayButtons(enable) {
    [paySbpBtn, payCryptoBtn].forEach(b => {
      if (!b) return;
      b.disabled = !enable;
      b.setAttribute("aria-disabled", String(!enable));
    });
  }

  // --- meta подарка ---
  function getGiftId() {
    const v = giftCard?.dataset?.giftId;
    return v ? String(v).trim() : null; // строкой, не Number()
  }
  function getPriceRub() {
    // приоритет: #giftCard[data-price] -> #totalCard[data-price] -> текст внутри #totalValue
    let p = parseFloat(String(giftCard?.dataset?.price || "").replace(",", "."));
    if (!Number.isFinite(p) || p <= 0) {
      p = parseFloat(String(totalCard?.dataset?.price || "").replace(",", "."));
    }
    if (!Number.isFinite(p) || p <= 0) {
      const raw = (totalValueEl?.textContent || "").replace(/[^\d,.-]/g, "").replace(",", ".");
      p = parseFloat(raw);
    }
    return Number.isFinite(p) && p > 0 ? p : 25; // дефолт 25 ₽, если совсем ничего
  }
  function refreshTotal() {
    const rub = getPriceRub();
    const minor = Math.round(rub * 100);
    if (totalValueEl) {
      totalValueEl.textContent = formatRub(rub);
      totalValueEl.dataset.amountMinor = String(minor);
    }
  }

  // --- текст карточки ---
  function setGiftDescription(text) {
    if (!giftDescEl) return;
    giftDescEl.textContent = String(text || "").trim();
  }
  function buildGiftText() {
    const sender = (senderInput?.value || "").trim();
    const msg    = (messageInput?.value || "").trim();
    if (sender && msg) return `Отправитель: ${sender} | ${msg}`;
    if (sender)        return `Отправитель: ${sender}`;
    if (msg)           return msg;
    return giftDescEl?.dataset?.default || "Сообщение для получателя";
  }
  function refreshGiftDesc() { setGiftDescription(buildGiftText()); }
  function refreshCounters() {
    if (senderCount && senderInput)   senderCount.textContent  = String(senderInput.value.length);
    if (messageCount && messageInput) messageCount.textContent = String(messageInput.value.length);
  }

  // --- вкл/выкл оплаты ---
  function refreshPayState() {
    const username    = normalizeUsername(usernameInput?.value || "");
    const gift_id     = getGiftId();
    const amountMinor = Number(totalValueEl?.dataset?.amountMinor || "0");
    const ok = !!username && !!gift_id && Number.isInteger(amountMinor) && amountMinor > 0;
    enablePayButtons(ok);
  }

  // --- action: оплата ---
  async function initiatePayment(provider) {
    try {
      setLoading(true);

      const username = normalizeUsername(usernameInput?.value || "");
      if (!username) { alert("Укажите username получателя (например, @username)."); return; }

      const gift_id = getGiftId();
      if (!gift_id) { alert("Не указан gift_id у подарка (добавьте data-gift-id на #giftCard)."); return; }

      const amountMinor = Number(totalValueEl?.dataset?.amountMinor || "0");
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) { alert("Сумма к оплате не рассчитана."); return; }

      const actorId = tg?.initDataUnsafe?.user?.id || null;
      const refCode = (typeof window.getRefCode === "function") ? (window.getRefCode() || null) : null;

      const THANKS_SUCCESS = window.PAY_SUCCESS_URL;
      const THANKS_FAIL    = window.PAY_FAIL_URL;

      const payload = {
        provider,
        product: PRODUCT,
        tg_username: username,
        qty: 1,
        amount_minor: amountMinor,
        currency: CURRENCY,
        gift_id,
        gift_text: buildGiftText(),

        // рефералка + «кто платит»
        ref_code: refCode,
        actor_tg_id: actorId,

        // возврат внутрь мини-аппа
        success_url: THANKS_SUCCESS,
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

  // --- UI init ---
  function initInputs() {
    // username
    usernameInput?.addEventListener("input", refreshPayState);
    usernameInput?.addEventListener("blur",  () => { usernameInput.value = normalizeUsername(usernameInput.value); refreshPayState(); });

    // sender/message (лимиты 24/91)
    const clamp = (s, max) => String(s || "").slice(0, max);

    senderInput?.addEventListener("input", () => {
      const v = clamp(senderInput.value, 24);
      if (v !== senderInput.value) {
        senderInput.value = v;
        try { senderInput.setSelectionRange(v.length, v.length); } catch {}
      }
      refreshCounters(); refreshGiftDesc();
    });
    messageInput?.addEventListener("input", () => {
      const v = clamp(messageInput.value, 91);
      if (v !== messageInput.value) {
        messageInput.value = v;
        try { messageInput.setSelectionRange(v.length, v.length); } catch {}
      }
      refreshCounters(); refreshGiftDesc();
    });

    // «купить себе»
    buyForMeBtn?.addEventListener("click", () => {
      let u = "";
      try { const tgu = tg?.initDataUnsafe?.user; if (tgu?.username) u = "@" + tgu.username; } catch {}
      if (!u) {
        const qU = new URL(window.location.href).searchParams.get("u");
        if (qU) u = normalizeUsername(qU);
      }
      if (!u) { alert("Не удалось определить ваш username из Telegram. Введите его вручную (например, @username)."); usernameInput?.focus(); return; }
      usernameInput.value = u;
      usernameInput.dispatchEvent(new Event("input", { bubbles: true }));
      usernameInput.blur();
    });

    // «указать мой юзернейм» в поле отправителя
    fillMyBtn?.addEventListener("click", () => {
      let u = "";
      try { const tgu = tg?.initDataUnsafe?.user; if (tgu?.username) u = "@" + tgu.username; } catch {}
      if (!u) {
        const qU = new URL(window.location.href).searchParams.get("me");
        if (qU) u = normalizeUsername(qU);
      }
      if (!u) { alert("Не удалось взять ваш username из Telegram. Введите его вручную (например, @username)."); senderInput?.focus(); return; }
      senderInput.value = u;
      refreshCounters(); refreshGiftDesc();
    });

    // сворачивание клавиатуры по тапу вне полей
    function blurIfOutside(e) {
      const ae = document.activeElement;
      if (!ae) return;
      const isInput = ae.tagName === "INPUT" || ae.tagName === "TEXTAREA";
      if (!isInput) return;
      if (ae.contains(e.target)) return;
      ae.blur();
    }
    document.addEventListener("pointerdown", blurIfOutside, { capture: true });
    document.addEventListener("touchstart",  blurIfOutside, { capture: true });
  }

  function initPayButtons() {
    paySbpBtn   && paySbpBtn.addEventListener("click",  () => initiatePayment("wata"));
    payCryptoBtn&& payCryptoBtn.addEventListener("click", () => initiatePayment("heleket"));
  }

  function init() {
    try { tg?.ready?.(); tg?.expand?.(); } catch {}
    // возможно, описание пришло через ?desc=
    const qDesc = new URLSearchParams(location.search).get("desc");
    if (qDesc) setGiftDescription(decodeURIComponent(qDesc));

    refreshTotal();
    refreshCounters();
    refreshGiftDesc();
    refreshPayState();

    initInputs();
    initPayButtons();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
