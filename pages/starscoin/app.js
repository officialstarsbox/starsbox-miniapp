(function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  try { tg?.ready?.(); tg?.expand?.(); } catch {}

  // ===== Состояние страницы (как раньше) =====
  let balance = 0;
  const tx = []; // история (пока пусто для демо)

  const $ = (s) => document.querySelector(s);
  function fmtAmount(v){ const n=Number(v||0); const sign=n>=0?"+":"–"; const cls=n>=0?"tx-amt--pos":"tx-amt--neg"; return {text:`${sign} ${Math.abs(n)} COIN`, cls}; }
  function renderBalance(){ const el = $("#scBalanceValue"); if (el) el.textContent = `${balance} COIN`; }
  function renderTx(){
    const list = $("#txList"), empty = $("#txEmpty");
    list.innerHTML = "";
    if (!tx.length){ empty.hidden=false; list.hidden=true; return; }
    empty.hidden=true; list.hidden=false;
    for (const it of tx){
      const li=document.createElement("li"); li.className="tx-item";
      const ico=document.createElement("div"); ico.className="tx-ico"; ico.textContent= it.type==="exchange"?"⇄":"★";
      const main=document.createElement("div"); main.className="tx-main";
      const t=document.createElement("p"); t.className="tx-title"; t.textContent= it.title || (it.type==="exchange"?"Обмен звёзд → StarsCoin":"Покупка за StarsCoin");
      const s=document.createElement("p"); s.className="tx-sub"; s.textContent = new Date(it.dt||Date.now()).toLocaleString("ru-RU");
      main.appendChild(t); main.appendChild(s);
      const amt=document.createElement("div"); const fa=fmtAmount(it.amount); amt.className=`tx-amt ${fa.cls}`; amt.textContent=fa.text;
      li.append(ico, main, amt); list.appendChild(li);
    }
  }

  // ====== Модалка обмена ======
  const modal   = $("#exModal");
  const exOpen  = $("#depositBtn");
  const exClose = $("#exClose");
  const exSubmit= $("#exSubmit");
  const starsIn = $("#starsIn");
  const coinsOut= $("#coinsOut");
  const rateVal = $("#rateVal");

  // курс обмена (можно менять на лету из кода/конфига)
  let EXCHANGE_RATE = 1.00; // 1 star = 1 coin по умолчанию

  // публичная «регулировка» курса (на всякий случай)
  window.setStarsToCoinRate = function (r){
    const n = Number(r);
    if (isFinite(n) && n>0){
      EXCHANGE_RATE = n;
      rateVal.textContent = n.toFixed(2);
      recalc();
    }
  };

  function openModal(){ modal.classList.add("is-open"); modal.setAttribute("aria-hidden","false"); starsIn.value=""; coinsOut.value="0"; updateSubmit(0); starsIn.focus(); }
  function closeModal(){ modal.classList.remove("is-open"); modal.setAttribute("aria-hidden","true"); }

  function onlyDigits(s){ return String(s||"").replace(/[^\d]/g,""); }

  function recalc(){
    const stars = parseInt(onlyDigits(starsIn.value)||"0", 10);
    const coins = Math.floor(stars * EXCHANGE_RATE);
    coinsOut.value = String(coins);
    updateSubmit(stars);
  }

  function updateSubmit(stars){
    const n = Number(stars||0);
    exSubmit.textContent = `Обменять ${n} stars`;
    exSubmit.disabled = !(n>0);
  }

  function requestStarsTransfer(stars){
    // минимально-совместимый путь: шлём payload боту (он откроет платёж звёздами)
    const payload = { action: "exchange_stars_to_coin", stars: Number(stars) };
    try{
      tg?.sendData?.(JSON.stringify(payload));
      tg?.showPopup?.({ title:"Подтвердите в чате", message:"Мы отправили запрос обмена. Продолжите в диалоге с ботом.", buttons:[{id:"ok", type:"close", text:"Окей"}] });
    }catch(e){
      alert("Не удалось инициировать обмен. Откройте чат с ботом и повторите.");
    }
  }

  // события
  document.addEventListener("DOMContentLoaded", () => {
    renderBalance(); renderTx();

    exOpen?.addEventListener("click", openModal);
    exClose?.addEventListener("click", closeModal);
    modal?.addEventListener("click", (e)=>{ if (e.target===modal) closeModal(); });
    document.addEventListener("keydown", (e)=>{ if (e.key==="Escape" && modal.classList.contains("is-open")) closeModal(); });

    starsIn?.addEventListener("input", () => {
      const raw = starsIn.value;
      const clean = onlyDigits(raw);
      if (raw !== clean) starsIn.value = clean;
      recalc();
    });

    exSubmit?.addEventListener("click", () => {
      const stars = parseInt(onlyDigits(starsIn.value)||"0",10);
      if (!stars) return;
      requestStarsTransfer(stars);
      closeModal();
    });

    // покажем актуальный курс
    rateVal.textContent = EXCHANGE_RATE.toFixed(2);
  });
})();
