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
    if (totalValue) totalValue.textContent = '—';
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

// === Stars binder ===
(function () {
  const api = window.starsboxApi;
  if (!api) return console.error("[stars] starsboxApi not found");

  // Попробуем найти элементы несколькими общими ID:
  const $ = (id) => document.getElementById(id);
  const usernameEl = $("#username") || $("#user") || $("#recipient") || $("#tgUsername") || $("#input-username");
  const qtyEl      = $("#qty") || $("#quantity") || $("#amount") || $("#starsQty") || $("#input-qty");
  const totalEl    = $("#total") || $("#sum") || $("#totalAmount") || $("#total_price") || $("#total-amount");
  const payWataBtn    = $("#pay-wata") || $("#btn-wata") || $("#paySbp") || $("#btnPayWata");
  const payHeleketBtn = $("#pay-heleket") || $("#btn-heleket") || $("#payCrypto") || $("#btnPayHeleket");

  const currency = (document.body.dataset.currency || "RUB").toUpperCase();

  function readUsername() {
    const v = (usernameEl && (usernameEl.value || usernameEl.textContent) || "").trim();
    if (!v) return null;
    return v.startsWith("@") ? v : "@" + v;
  }
  function readQty() {
    const raw = (qtyEl && (qtyEl.value || qtyEl.textContent || qtyEl.dataset.value)) || "0";
    const n = parseInt(String(raw).replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function readAmountMinor(fallbackBtn) {
    // 1) Пробуем взять из total (innerText или value)
    if (totalEl) {
      const raw = String(totalEl.value ?? totalEl.innerText ?? "").replace(/[^\d]/g, "");
      if (raw) {
        const v = parseInt(raw, 10);
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
    // 2) Пробуем data-атрибут на кнопке
    if (fallbackBtn && fallbackBtn.dataset && fallbackBtn.dataset.amountMinor) {
      const v = parseInt(fallbackBtn.dataset.amountMinor, 10);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return 0;
  }

  async function start(provider, btn) {
    const username = readUsername();
    const qty = readQty();
    const amount_minor = readAmountMinor(btn);

    if (!username) return alert("Укажите @юзернейм получателя");
    if (!qty) return alert("Укажите количество звёзд");
    if (!amount_minor) return alert("Сумма к оплате не определена");

    try {
      const r = await api.initiatePayment({
        provider,
        product: "stars",
        username,
        qty,
        amount_minor,
        currency
      });
      if (r?.payment_url) window.location.href = r.payment_url;
      else alert(`Заказ создан: ${r?.orderId || "?"}`);
    } catch (e) {
      console.error(e);
      alert("Ошибка при создании платежа");
    }
  }

  payWataBtn    && payWataBtn.addEventListener("click", (e) => { e.preventDefault(); start("wata",    e.currentTarget); });
  payHeleketBtn && payHeleketBtn.addEventListener("click", (e) => { e.preventDefault(); start("heleket", e.currentTarget); });
})();
