const $ = s => document.querySelector(s);
const L = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } };
const S = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} };
let token = L('token', null), dev = false, price = 1500, priceUsd = 2, priceDay = 300, priceDayUsd = 1, usdOn = false, wa = '';
const device = L('device', null) || (() => { const d = crypto.randomUUID(); S('device', d); return d })();
let type = 'invoice', logo = L('invLogo', null), hist = L('invHist', []), custs = L('invCusts', []), cat = L('invCat', []);
const TYPES = { invoice: ['INV-', 'INVOICE', 'Total due'], receipt: ['RCT-', 'RECEIPT', 'Total paid'], quote: ['QUO-', 'QUOTE', 'Total'] };
const todayStr = () => new Date().toISOString().slice(0, 10);
const isPro = () => token && token.exp > Date.now();
const status = m => $('#status').textContent = m || '';
const SYM = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' };
const fmt = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Plan / payments (same Pro plan as Billo) ----------
function renderPlan() { $('#alt').classList.toggle('hide', !!isPro()); $('#plan').textContent = isPro() ? (dev ? 'PRO (test) ✓' : 'PRO ✓') : (dev ? 'Free (test)' : 'Free · Go Pro'); $('#plan').classList.toggle('pro', isPro()); $('#logoPrev').classList.toggle('hide', !(isPro() && logo)); $('#logoX').classList.toggle('hide', !(isPro() && logo)); fillCusts(); renderHist() }
function cur() { return usdOn && Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Africa/Lagos' ? 'USD' : 'NGN' }
function priceTxt(p = 'month') { const u = cur() === 'USD'; return u ? '$' + (p === 'day' ? priceDayUsd : priceUsd) : '₦' + (p === 'day' ? priceDay : price).toLocaleString() }
async function upgrade(plan = 'month') {
  const email = prompt('Enter your email to pay (your receipt goes here):'); if (!email) return;
  try {
    const j = await (await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, currency: cur(), plan }) })).json();
    j.url ? location.href = j.url : alert(j.error);
  } catch { alert('Server not reachable.') }
}
function needPro(what) {
  if (isPro()) return true;
  $('#planWhat').textContent = what + ' is a Pro feature';
  $('#pDay').textContent = '24-hour pass · ' + priceTxt('day'); $('#pMonth').textContent = '30 days · ' + priceTxt('month');
  $('#planSheet').classList.remove('hide'); return false;
}
$('#pDay').onclick = () => { $('#planSheet').classList.add('hide'); upgrade('day') };
$('#pMonth').onclick = () => { $('#planSheet').classList.add('hide'); upgrade('month') };
$('#pCancel').onclick = () => $('#planSheet').classList.add('hide');
$('#plan').onclick = async () => {
  if (dev) {
    if (isPro()) { token = null; localStorage.removeItem('token'); S('devFree', true) }
    else { token = await (await fetch('/api/dev-pro', { method: 'POST' })).json(); S('token', token); S('devFree', false) }
    return renderPlan();
  }
  if (!isPro()) needPro('Pro');
};
(async () => {
  const ref = new URLSearchParams(location.search).get('reference');
  if (ref) { const r = await fetch('/api/verify?reference=' + encodeURIComponent(ref)); if (r.ok) { token = await r.json(); S('token', token); window.track?.('purchase') } history.replaceState({}, '', '/') }
  try { const cf = await (await fetch('/api/config')).json(); dev = cf.dev; price = cf.price; priceUsd = cf.priceUsd; priceDay = cf.priceDay; priceDayUsd = cf.priceDayUsd; usdOn = cf.usdOn; wa = cf.wa } catch {}
  if (dev && !isPro() && !L('devFree', false)) { try { token = await (await fetch('/api/dev-pro', { method: 'POST' })).json(); S('token', token) } catch {} }
  renderPlan();
})();

// ---------- Form ----------
const nextNo = () => TYPES[type][0] + String(L('invNo_' + type, 0) + 1).padStart(4, '0');
function addItem(v = {}) {
  const r = document.createElement('div'); r.className = 'it';
  r.innerHTML = '<input class="d" placeholder="Item or service" maxlength="200"><div class="g"><input class="q" type="number" inputmode="decimal" min="0" step="any" placeholder="Qty" value="1"><input class="p" type="number" inputmode="decimal" min="0" step="any" placeholder="Price"><span class="lt">0.00</span><button class="btn ghost sv" type="button" aria-label="Save item">★</button><button class="btn danger x" type="button" aria-label="Remove">✕</button></div>';
  r.querySelector('.d').value = v.desc || ''; if (v.qty != null) r.querySelector('.q').value = v.qty; r.querySelector('.p').value = v.price ?? '';
  r.querySelector('.sv').onclick = () => {
    if (!needPro('Saved items')) return;
    const desc = r.querySelector('.d').value.trim(), p = parseFloat(r.querySelector('.p').value) || 0; if (!desc) return;
    cat = [{ desc, price: p }, ...cat.filter(c => c.desc !== desc)].slice(0, 200); S('invCat', cat); status('Item saved ★'); renderCat();
  };
  r.querySelector('.x').onclick = () => { r.remove(); if (!document.querySelector('.it')) addItem(); refresh() };
  $('#items').append(r);
}
function data() {
  const items = [...document.querySelectorAll('.it')].map(r => ({ desc: r.querySelector('.d').value.trim(), qty: parseFloat(r.querySelector('.q').value) || 0, price: parseFloat(r.querySelector('.p').value) || 0 }));
  return { type, number: $('#num').value.trim(), date: $('#date').value, due: $('#due').value, method: $('#method').value,
    biz: { name: $('#bname').value.trim(), phone: $('#bphone').value.trim(), address: $('#baddr').value.trim() },
    cust: { name: $('#cname').value.trim(), contact: $('#ccontact').value.trim() }, items,
    discount: parseFloat($('#disc').value) || 0, tax: parseFloat($('#tax').value) || 0, fee: parseFloat($('#fee').value) || 0, currency: $('#cur').value, notes: $('#notes').value.trim() };
}
function calc(d) { const sub = d.items.reduce((a, i) => a + i.qty * i.price, 0), disc = Math.min(d.discount, sub), tx = (sub - disc) * d.tax / 100; return { sub, disc, tx, fee: d.fee, total: sub - disc + tx + d.fee } }
function refresh() {
  const d = data(), t = calc(d), s = SYM[d.currency];
  document.querySelectorAll('.it').forEach((r, i) => r.querySelector('.lt').textContent = fmt(d.items[i].qty * d.items[i].price));
  $('#tot').innerHTML = `<div><span>Subtotal</span><span>${s}${fmt(t.sub)}</span></div>` + (t.disc ? `<div><span>Discount</span><span>-${s}${fmt(t.disc)}</span></div>` : '') + (t.tx ? `<div><span>Tax</span><span>${s}${fmt(t.tx)}</span></div>` : '') + (t.fee ? `<div><span>Delivery</span><span>${s}${fmt(t.fee)}</span></div>` : '') + `<div class="big"><span>${TYPES[type][2]}</span><span>${s}${fmt(t.total)}</span></div>`;
  $('#pv').innerHTML = `<div class="ph"><b>${TYPES[type][1]}</b><span style="text-align:right">${esc(d.number)}<br>${esc(d.date)}</span></div><div class="pb"><b>${esc(d.biz.name || 'Your business')}</b><br>${esc(d.biz.phone)} ${esc(d.biz.address)}</div><div class="pb"><small>BILL TO</small><br><b>${esc(d.cust.name || '-')}</b> ${esc(d.cust.contact)}</div><table>${d.items.filter(i => i.desc).map(i => `<tr><td>${esc(i.desc)}</td><td>${i.qty} × ${fmt(i.price)}</td><td>${s}${fmt(i.qty * i.price)}</td></tr>`).join('')}</table><p class="tt">${TYPES[type][2]}: <b>${s}${fmt(t.total)}</b></p>`;
  S('invBiz', { name: d.biz.name, phone: d.biz.phone, address: d.biz.address, notes: d.notes, currency: d.currency });
}
function setType(t) {
  type = t; [['Inv', 'invoice'], ['Rct', 'receipt'], ['Quo', 'quote']].forEach(([k, v]) => $('#t' + k).classList.toggle('on', v === t));
  $('#due').classList.toggle('hide', t === 'receipt'); $('#dueLbl').classList.toggle('hide', t === 'receipt'); $('#dueLbl').textContent = t === 'quote' ? 'Valid until' : 'Due date';
  $('#method').classList.toggle('hide', t !== 'receipt'); $('#num').value = nextNo(); refresh();
}
$('#tInv').onclick = () => setType('invoice'); $('#tRct').onclick = () => setType('receipt'); $('#tQuo').onclick = () => setType('quote');
$('#addItem').onclick = () => { addItem(); document.querySelector('.it:last-child .d').focus() };

// ---------- Saved items catalogue (Pro) ----------
function renderCat() {
  const b = $('#catBox'); b.innerHTML = cat.length ? '' : '<p style="color:var(--mu)">No saved items yet. Tap ★ on an item to save it.</p>';
  cat.forEach((c, i) => {
    const r = document.createElement('div'); r.className = 'item'; r.style.flexDirection = 'row'; r.style.alignItems = 'center';
    const t = document.createElement('div'); t.className = 't'; t.innerHTML = '<span></span>'; t.firstChild.textContent = c.desc + ' · ' + fmt(c.price);
    const add = Object.assign(document.createElement('button'), { textContent: 'Add', className: 'btn ghost' });
    const del = Object.assign(document.createElement('button'), { textContent: '✕', className: 'btn danger' });
    add.onclick = () => { const last = [...document.querySelectorAll('.it')].pop(); if (last && !last.querySelector('.d').value.trim()) last.remove(); addItem({ desc: c.desc, qty: 1, price: c.price }); refresh() };
    del.onclick = () => { cat.splice(i, 1); S('invCat', cat); renderCat() };
    r.append(t, add, del); b.append(r);
  });
}
$('#fromCat').onclick = () => { if (!needPro('Saved items')) return; $('#catBox').classList.toggle('hide'); renderCat() };
document.addEventListener('input', refresh);

// ---------- Logo (Pro) ----------
$('#logoBtn').onclick = e => { if (!isPro()) { e.preventDefault(); needPro('Your logo') } };
$('#logo').onchange = e => {
  const f = e.target.files[0]; if (!f) return; const img = new Image();
  img.onload = () => {
    const s = Math.min(1, 220 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    const u = c.toDataURL('image/jpeg', .85); logo = u.split(',')[1]; $('#logoPrev').src = u; S('invLogo', logo); renderPlan();
  };
  img.src = URL.createObjectURL(f);
};
$('#logoX').onclick = () => { logo = null; localStorage.removeItem('invLogo'); renderPlan() };

// ---------- Build, download, share ----------
async function build(format) {
  const d = data();
  if (!d.biz.name) { status('Enter your business name.'); return null }
  if (!d.items.some(i => i.desc && i.qty > 0)) { status('Add at least one item with a quantity.'); return null }
  status('Preparing…');
  const send = () => fetch('/api/invoice', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pro-token': token?.t || '' }, body: JSON.stringify({ format, data: d, logo: isPro() ? logo : null, device }) });
  // Render's free server sleeps when idle and answers 502/503 (or drops the connection) while it wakes up, which can take about a minute.
  let r = null;
  for (let i = 0; i < 20 && !r; i++) {
    try { const x = await send(); if (![502, 503, 504].includes(x.status)) r = x } catch {}
    if (!r) { status(i ? 'Waking the server… ' + Math.round(i * 3) + 's (this only happens after a quiet spell)' : 'Waking the server… one moment'); await new Promise(ok => setTimeout(ok, 3000)) }
  }
  if (!r) { status('Cannot reach the server. Check your internet, wait a minute and try again.'); return null }
  if (!r.ok) {
    let msg = 'Something went wrong (error ' + r.status + '). Please try again.';
    try { msg = (await r.json()).error || msg } catch {}
    status(msg); if (r.status === 402) needPro(format === 'word' ? 'Word export' : 'Unlimited invoices'); return null;
  }
  try { const blob = await r.blob(); status(''); return { blob, d } } catch { status('The file did not come through. Please try again.'); return null }
}
const fname = (d, ext) => ((d.type + '-' + (d.number || 'doc')).replace(/[^\w-]/g, '')) + '.' + ext;
const save = (blob, name) => Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name }).click();
function done(d) {
  const auto = d.number === nextNo(); saveHist(d); if (auto) S('invNo_' + type, L('invNo_' + type, 0) + 1);
  $('#num').value = nextNo(); refresh();
  if (isPro() && d.cust.name && !custs.includes(d.cust.name)) { custs.unshift(d.cust.name); custs = custs.slice(0, 100); S('invCusts', custs); fillCusts() }
  window.track?.('invoice_made');
  const n = L('invTotal', 0) + 1; S('invTotal', n); if (n === 2) window.track?.('second_invoice'); if (n === 5) window.track?.('fifth_invoice');
}
$('#dl').onclick = async () => { const o = await build('pdf'); if (!o) return; save(o.blob, fname(o.d, 'pdf')); done(o.d); status('Downloaded ✔') };
// Chrome can share the PDF file itself. Browsers that cannot (e.g. Opera Mini) get the PDF downloaded plus a ready message.
function waNumber(c) {
  let n = /@/.test(c || '') ? '' : String(c || '').replace(/\D/g, ''); if (n.startsWith('0') && n.length === 11) n = '234' + n.slice(1);
  return n.length < 10 || n.length > 15 ? '' : n;
}
function docMsg(d) {
  return `Hello${d.cust.name ? ' ' + d.cust.name : ''}, here is your ${d.type} ${d.number} from ${d.biz.name}: ${SYM[d.currency]}${fmt(calc(d).total)}${d.type === 'invoice' && d.due ? ', due ' + d.due : ''}. Thank you!`;
}
$('#sh').onclick = async () => {
  const o = await build('pdf'); if (!o) return; const name = fname(o.d, 'pdf'); let f = null;
  try { f = new File([o.blob], name, { type: 'application/pdf' }) } catch {}
  if (f && navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: o.d.number, text: docMsg(o.d) }); done(o.d) } catch {} return }
  save(o.blob, name); done(o.d);
  if (navigator.share) { try { await navigator.share({ title: o.d.number, text: docMsg(o.d) }) } catch {} }
  status('This browser cannot attach files, so the PDF was downloaded. Open WhatsApp and attach it from your downloads.');
};
$('#wa').onclick = async () => {
  const o = await build('pdf'); if (!o) return; save(o.blob, fname(o.d, 'pdf')); done(o.d);
  open('https://wa.me/' + waNumber(o.d.cust.contact) + '?text=' + encodeURIComponent(docMsg(o.d)), '_blank');
  status('PDF downloaded. In WhatsApp, tap the paperclip and attach it.'); window.track?.('whatsapp_send');
};
$('#wd').onclick = async () => { if (!needPro('Word export')) return; const o = await build('word'); if (!o) return; save(o.blob, fname(o.d, 'doc')); done(o.d); status('Downloaded ✔') };

// ---------- History & customers ----------
function fillCusts() { $('#custList').innerHTML = isPro() ? custs.map(c => `<option value="${esc(c)}">`).join('') : '' }
function saveHist(d) {
  const i = d.number ? hist.findIndex(h => h.d.type === d.type && h.d.number === d.number) : -1;
  if (i >= 0) hist[i] = { ...hist[i], d }; else hist.unshift({ id: Date.now(), d, paid: false });
  hist = isPro() ? hist.slice(0, 200) : hist.slice(0, 5); S('invHist', hist); renderHist();
}
$('#sv').onclick = () => { const d = data(); if (!d.biz.name && !d.items.some(i => i.desc)) return; saveHist(d); status('Saved ✔') };
function load(d) {
  setType(d.type); $('#num').value = d.number; $('#date').value = d.date; $('#due').value = d.due; $('#method').value = d.method || 'Cash';
  $('#bname').value = d.biz.name; $('#bphone').value = d.biz.phone; $('#baddr').value = d.biz.address; $('#cname').value = d.cust.name; $('#ccontact').value = d.cust.contact;
  $('#disc').value = d.discount || ''; $('#tax').value = d.tax || ''; $('#fee').value = d.fee || ''; $('#cur').value = d.currency; $('#notes').value = d.notes;
  $('#items').innerHTML = ''; d.items.forEach(addItem); if (!d.items.length) addItem(); refresh(); scrollTo(0, 0);
}
const state = h => h.d.type !== 'invoice' ? h.d.type : h.paid ? 'paid' : (h.d.due && h.d.due < todayStr() ? 'overdue' : 'unpaid');
function renderOwed() {
  const m = {}; let u = 0, o = 0;
  hist.forEach(h => { const st = state(h); if (st === 'unpaid' || st === 'overdue') { u++; if (st === 'overdue') o++; m[h.d.currency] = (m[h.d.currency] || 0) + calc(h.d).total } });
  const box = $('#owed'); if (!u) { box.innerHTML = ''; return }
  box.innerHTML = isPro() ? `Owed to you: <b>${Object.entries(m).map(([c, v]) => SYM[c] + fmt(v)).join(' + ')}</b> · ${u} unpaid${o ? ` (${o} overdue)` : ''}` : `You have ${u} unpaid invoice${u > 1 ? 's' : ''}. <a href="#" id="owedPro">See how much you are owed (Pro)</a>`;
  if (!isPro()) $('#owedPro').onclick = e => { e.preventDefault(); needPro('The unpaid tracker') };
}
function remind(h) {
  if (!needPro('Payment reminders')) return;
  const d = h.d, tt = SYM[d.currency] + fmt(calc(d).total), c = d.cust.contact || '';
  const msg = `Hello${d.cust.name ? ' ' + d.cust.name : ''}, a friendly reminder that ${d.number} from ${d.biz.name} for ${tt}${d.due ? ' was due on ' + d.due : ' is awaiting payment'}. Please send payment when you can. Thank you!`;
  const n = waNumber(c);
  open('https://wa.me/' + n + '?text=' + encodeURIComponent(msg), '_blank'); window.track?.('reminder');
}
function toReceipt(h) {
  const d = JSON.parse(JSON.stringify(h.d)); d.type = 'receipt'; d.due = ''; d.method = 'Cash'; d.date = todayStr(); d.number = '';
  h.paid = true; S('invHist', hist); load(d); $('#num').value = nextNo(); refresh(); renderHist();
  window.track?.('receipt_from_invoice'); status('Receipt ready. Choose how it was paid, then download.');
}
function renderHist() {
  const box = $('#hist'); renderOwed();
  box.innerHTML = hist.length ? '' : '<p style="color:var(--mu)">Nothing yet. Documents you download or save appear here.' + (isPro() ? '' : ' Free keeps the last 5.') + '</p>';
  hist.forEach(h => {
    const t = calc(h.d), st = state(h), row = document.createElement('div'); row.className = 'item';
    const info = document.createElement('div'); info.className = 't'; info.innerHTML = '<small></small><span></span>';
    info.children[0].textContent = h.d.type + ' ' + h.d.number + ' · ' + h.d.date; info.children[1].textContent = (h.d.cust.name || '-') + ' · ' + SYM[h.d.currency] + fmt(t.total);
    const badge = document.createElement('span'); badge.className = 'bd b-' + st; badge.textContent = st; info.children[1].append(badge);
    const acts = document.createElement('div'); acts.className = 'acts';
    const mk = (label, cls, fn) => { const b = Object.assign(document.createElement('button'), { textContent: label, className: 'btn ' + cls, type: 'button' }); b.onclick = fn; acts.append(b) };
    mk('Open', 'ghost', () => load(h.d));
    if (h.d.type === 'invoice') {
      mk(h.paid ? 'Mark unpaid' : 'Mark paid', 'ghost', () => { h.paid = !h.paid; S('invHist', hist); renderHist() });
      mk('Make receipt', 'ghost', () => toReceipt(h));
      if (!h.paid) mk('Remind', 'ghost', () => remind(h));
    }
    mk('Delete', 'danger', () => { if (confirm('Delete this saved document?')) { hist = hist.filter(m => m.id !== h.id); S('invHist', hist); renderHist() } });
    row.append(info, acts); box.append(row);
  });
}

// ---------- Backup & restore ----------
$('#bk').onclick = () => {
  const o = { app: 'billo', v: 1, hist, custs, cat, biz: L('invBiz', {}), logo, counters: { invoice: L('invNo_invoice', 0), receipt: L('invNo_receipt', 0), quote: L('invNo_quote', 0) } };
  save(new Blob([JSON.stringify(o)], { type: 'application/json' }), 'billo-backup-' + todayStr() + '.json'); status('Backup downloaded ✔'); window.track?.('backup');
};
$('#rs').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const o = JSON.parse(await f.text()); if (o.app !== 'billo' || !Array.isArray(o.hist)) throw 0;
    if (!confirm('Restore this backup? It replaces what is saved on this device.')) return;
    S('invHist', o.hist.filter(h => h && h.d && Array.isArray(h.d.items) && h.d.biz && h.d.cust).slice(0, isPro() ? 200 : 5));
    S('invCusts', (o.custs || []).filter(x => typeof x === 'string').slice(0, 100));
    S('invCat', (o.cat || []).filter(c => c && typeof c.desc === 'string').slice(0, 200));
    if (o.biz && typeof o.biz === 'object') S('invBiz', o.biz);
    if (typeof o.logo === 'string' && o.logo.length < 400000) S('invLogo', o.logo);
    Object.entries(o.counters || {}).forEach(([k, v]) => TYPES[k] && Number.isFinite(v) && S('invNo_' + k, Math.max(0, v | 0)));
    location.reload();
  } catch { status('That file is not a Billo backup.') }
};

function newDoc() { $('#items').innerHTML = ''; addItem(); ['cname', 'ccontact', 'disc', 'tax', 'fee', 'due'].forEach(i => $('#' + i).value = ''); $('#num').value = nextNo(); refresh(); scrollTo(0, 0) }
$('#nw').onclick = () => { if (confirm('Start a new blank document? Your business details are kept.')) newDoc() };

// ---------- Manual payment: pay on WhatsApp, then enter the access code you receive ----------
$('#waPay').onclick = e => {
  e.preventDefault();
  if (!wa) return alert('WhatsApp payment is not set up yet.');
  open('https://wa.me/' + wa + '?text=' + encodeURIComponent('Hi, I want to pay for Billo Pro. My card did not work.'), '_blank');
};
$('#code').onclick = async e => {
  e.preventDefault();
  const code = prompt('Enter your access code:'); if (!code) return;
  try {
    const r = await fetch('/api/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    const j = await r.json(); if (!r.ok) return alert(j.error);
    token = j; S('token', token); renderPlan(); window.track?.('purchase', { method: 'code' });
    alert(j.plan === 'day' ? 'Pro unlocked for 24 hours ✔' : 'Pro unlocked for 30 days ✔');
  } catch { alert('Server not reachable.') }
};

// ---------- Start ----------
const b = L('invBiz', {});
$('#bname').value = b.name || ''; $('#bphone').value = b.phone || ''; $('#baddr').value = b.address || ''; $('#notes').value = b.notes || ''; $('#cur').value = b.currency || 'NGN';
$('#date').value = new Date().toISOString().slice(0, 10);
addItem(); setType('invoice'); renderHist();
if (logo) $('#logoPrev').src = 'data:image/jpeg;base64,' + logo;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
