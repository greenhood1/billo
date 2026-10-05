(function () {
  var v = localStorage.getItem('consent');
  if (v === 'yes') { window.loadGA && loadGA(); return; }
  if (v === 'no') return;
  var b = document.createElement('div'); b.className = 'consent';
  b.innerHTML = '<span>We use Google Analytics to count visitors. <a href="/privacy">Privacy</a></span><button id="cy">Accept</button><button id="cn">No thanks</button>';
  document.body.appendChild(b);
  document.getElementById('cy').onclick = function () { localStorage.setItem('consent', 'yes'); window.loadGA && loadGA(); b.remove(); };
  document.getElementById('cn').onclick = function () { localStorage.setItem('consent', 'no'); b.remove(); };
})();
