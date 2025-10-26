(function(){
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  try { tg?.ready?.(); } catch {}

  function goBack(){
    // Внутри WebApp предпочтём history, затем — явный переход на главную
    if (history.length > 1) {
      history.back();
      return;
    }
    // путь к корню мини-аппа (две директории вверх от /pages/starscoin/)
    const base = location.origin + location.pathname.replace(/\/pages\/starscoin\/.*$/, '/');
    location.href = base + 'index.html';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const back = document.getElementById('backBtn');
    back?.addEventListener('click', goBack);
  });
})();
