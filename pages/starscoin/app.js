(function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  try { tg?.ready?.(); tg?.expand?.(); } catch {}

  // ===== МОДЕЛЬ (позже сюда подставим реальные данные с бэка) =====
  // balanceMinor: баланс в "копейках" StarsCoin? сейчас считаем в целых — просто число
  let balance = 0;

  /** Пример структуры транзакций (пока пусто). Позже заполним:
   *  type: 'exchange' | 'purchase'
   *  title: строка для человека
   *  dt: ISO-строка даты
   *  amount: число (плюс — поступление, минус — списание)
   */
  const tx = []; // ← оставляем пустым, чтобы показать empty state

  // ====== РЕНДЕР ======
  const $ = (s) => document.querySelector(s);

  function fmtAmount(v) {
    const n = Number(v || 0);
    const sign = n >= 0 ? "+" : "–";
    const cls = n >= 0 ? "tx-amt--pos" : "tx-amt--neg";
    return { text: `${sign} ${Math.abs(n)} COIN`, cls };
  }

  function renderBalance() {
    const el = $("#scBalanceValue");
    if (el) el.textContent = `${balance} COIN`;
  }

  function renderTx() {
    const list = $("#txList");
    const empty = $("#txEmpty");
    if (!list || !empty) return;

    list.innerHTML = "";

    if (!tx.length) {
      empty.hidden = false;
      list.hidden = true;
      return;
    }

    empty.hidden = true;
    list.hidden = false;

    for (const it of tx) {
      const li = document.createElement("li");
      li.className = "tx-item";

      const icon = document.createElement("div");
      icon.className = "tx-ico";
      icon.textContent = it.type === "exchange" ? "⇄" : "★";

      const main = document.createElement("div");
      main.className = "tx-main";
      const t = document.createElement("p");
      t.className = "tx-title";
      t.textContent = it.title || (it.type === "exchange" ? "Обмен звёзд → StarsCoin" : "Покупка за StarsCoin");
      const s = document.createElement("p");
      s.className = "tx-sub";
      try {
        const dt = new Date(it.dt);
        s.textContent = dt.toLocaleString("ru-RU");
      } catch {
        s.textContent = "";
      }
      main.appendChild(t);
      main.appendChild(s);

      const amt = document.createElement("div");
      const fa = fmtAmount(it.amount);
      amt.className = `tx-amt ${fa.cls}`;
      amt.textContent = fa.text;

      li.appendChild(icon);
      li.appendChild(main);
      li.appendChild(amt);
      list.appendChild(li);
    }
  }

  // ====== ДЕЙСТВИЯ ======
  document.addEventListener("DOMContentLoaded", () => {
    // Кнопка пополнения — позже подкинем реальный поток
    const dep = document.getElementById("depositBtn");
    dep?.addEventListener("click", () => {
      // откройте ваш flow пополнения StarsCoin (пока заглушка)
      tg?.showPopup?.({
        title: "Пополнение",
        message: "Здесь будет поток пополнения StarsCoin.",
        buttons: [{ id: "ok", type: "close", text: "Окей" }]
      });
    });

    renderBalance();
    renderTx();
  });
})();
