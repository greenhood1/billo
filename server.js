require('dotenv').config();
const express = require('express'), crypto = require('crypto'), path = require('path'), fs = require('fs');
const E = process.env;
const FREE_DAILY = +E.FREE_DAILY || 5, BASE = E.BASE_URL || 'http://localhost:3000';
const SECRET = E.SECRET || 'dev-secret', MODEL = E.MODEL || 'claude-haiku-4-5-20251001';
const PROD = E.NODE_ENV === 'production', DEV = !PROD && E.DEV_PRO === '1', ACC_FREE = +E.ACCURATE_FREE_DAILY || 3;
if (PROD && !E.SECRET) { console.error('Set SECRET in production.'); process.exit(1); }
const app = express();
const PRICE = +E.PRO_PRICE_NGN || 1500, PRICE_USD = +E.PRO_PRICE_USD || 2, PRICE_DAY = +E.PRO_DAY_NGN || 300, PRICE_DAY_USD = +E.PRO_DAY_USD || 1, USD_ON = E.USD_ENABLED === '1', usedRefs = new Set();
app.set('trust proxy', 1);
app.get('/health', (req, res) => res.send('ok'));
app.use((req, res, next) => {   // HTTPS only + safe headers
  if (PROD && req.get('x-forwarded-proto') === 'http') return res.redirect(301, 'https://' + req.get('host') + req.originalUrl);
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(self)' });
  next();
});
const hits = new Map();         // simple rate limit: 40 API calls / minute / IP
app.use('/api', (req, res, next) => {
  const now = Date.now(), h = (hits.get(req.ip) || []).filter(t => now - t < 60000);
  if (h.length >= 40) return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  h.push(now); hits.set(req.ip, h); next();
});
setInterval(() => hits.clear(), 600000);

// Google Analytics loader (ID comes from .env so it is never hard-coded)
app.get('/ga.js', (req, res) => {   // loaded only after the visitor accepts (see consent.js)
  res.type('js').send(`(function(){var id=${JSON.stringify(E.GA_ID || '')};window.track=function(n,p){window.gtag&&gtag('event',n,p||{})};
window.loadGA=function(){if(!id||window.__ga)return;window.__ga=1;var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+id;document.head.appendChild(s);
window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config',id);}})();`);
});
app.use(express.json({ limit: '8mb' }));
// Flat project (no folders): only these files are ever shared with visitors; server.js and secrets never are.
const PUBLIC = ['index.html', 'app.js', 'style.css', 'consent.js', 'sw.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'privacy.html', 'terms.html', 'admin.html'];
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const f = req.path === '/' ? 'index.html' : req.path.slice(1);
  const hit = PUBLIC.includes(f) ? f : PUBLIC.includes(f + '.html') ? f + '.html' : null;
  if (!hit) return next();
  if (hit === 'privacy.html' || hit === 'terms.html') {   // contact email + date are filled in from settings
    const p = path.join(__dirname, hit), when = fs.statSync(p).mtime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    return res.type('html').send(fs.readFileSync(p, 'utf8').replace(/YOUR_EMAIL@example\.com/g, E.SUPPORT_EMAIL || 'YOUR_EMAIL@example.com').replace(/\[DATE\]/g, when));
  }
  res.sendFile(path.join(__dirname, hit));
});

// ---- Pro tokens (signed): plan 'day' = 24 hours, 'month' = 30 days ----
const sign = x => crypto.createHmac('sha256', SECRET).update(String(x)).digest('hex');
const makeToken = (plan = 'month') => {
  const exp = Date.now() + (plan === 'day' ? 864e5 : 30 * 864e5);
  return { t: plan + '.' + exp + '.' + sign(plan + '.' + exp), exp, plan };
};
const isPro = req => {
  const [plan, exp, sig] = String(req.get('x-pro-token') || '').split('.');
  return (plan === 'day' || plan === 'month') && +exp > Date.now() && sig === sign(plan + '.' + exp);
};

// ---- Free daily usage (in memory; use Redis/DB in production) ----
const usage = new Map();
const used = (id, inc) => {
  const k = id + new Date().toISOString().slice(0, 10);
  const n = (usage.get(k) || 0) + (inc ? 1 : 0);
  if (inc) usage.set(k, n);
  return n;
};

// ---- Test mode (DEV_PRO=1): lets you try Pro without paying. Turn OFF in production. ----
app.get('/api/config', (req, res) => res.json({ dev: DEV, price: PRICE, priceUsd: PRICE_USD, usdOn: USD_ON, priceDay: PRICE_DAY, priceDayUsd: PRICE_DAY_USD, wa: E.WHATSAPP_NUMBER || '' }));
app.post('/api/dev-pro', (req, res) => DEV ? res.json(makeToken()) : res.status(403).json({ error: 'Disabled.' }));

// ---- Invoice & receipt maker: free = 3 PDFs a month with a footer line; Pro = unlimited, logo, Word ----
const makeInvoicePdf = require('./pdfinv'), FREE_INV = +E.FREE_INVOICES || 3, invCount = new Map();
const stats = new Map(), startedAt = new Date().toISOString(); let totalDocs = 0;   // memory only: resets on restart
const count = dv => { dv = String(dv).slice(0, 36); stats.set(dv, (stats.get(dv) || 0) + 1); totalDocs++; console.log('document made by', dv.slice(0, 8)) };
const nm = (v, max) => { v = Number(v); return Number.isFinite(v) && v >= 0 ? Math.min(v, max) : 0 };
const st = (v, n) => String(v ?? '').slice(0, n);
app.post('/api/invoice', (req, res) => {
  const { format = 'pdf', data: x = {}, logo, device = 'anon' } = req.body, pro = isPro(req);
  if (format === 'word' && !pro) return res.status(402).json({ error: 'Word export is a Pro feature.' });
  const items = (Array.isArray(x.items) ? x.items : []).slice(0, 50)
    .map(i => ({ desc: st(i.desc, 200).trim(), qty: nm(i.qty, 1e6), price: nm(i.price, 1e12) })).filter(i => i.desc && i.qty > 0);
  if (!items.length) return res.status(400).json({ error: 'Add at least one item with a quantity.' });
  const d = { type: ['receipt', 'quote'].includes(x.type) ? x.type : 'invoice', number: st(x.number, 30), date: st(x.date, 20), due: st(x.due, 20), method: st(x.method, 30),
    biz: { name: st(x.biz?.name, 80) || 'My Business', phone: st(x.biz?.phone, 40), address: st(x.biz?.address, 150) },
    cust: { name: st(x.cust?.name, 80), contact: st(x.cust?.contact, 100) }, items, tax: nm(x.tax, 100), notes: st(x.notes, 600),
    currency: ['NGN', 'USD', 'GBP', 'EUR'].includes(x.currency) ? x.currency : 'NGN' };
  const sub = items.reduce((a, i) => a + i.qty * i.price, 0), discount = Math.min(nm(x.discount, 1e13), sub), tax = (sub - discount) * d.tax / 100, fee = nm(x.fee, 1e13);
  const t = { sub, discount, tax, fee, total: sub - discount + tax + fee };
  const key = req.ip + '|' + device + '|' + new Date().toISOString().slice(0, 7);
  if (!pro && (invCount.get(key) || 0) >= FREE_INV)
    return res.status(402).json({ error: `Free plan: ${FREE_INV} invoices a month. Upgrade for unlimited.` });
  const fname = (d.type + '-' + d.number).replace(/[^\w-]/g, '') || 'document';
  if (format === 'word') {
    count(device);
    const h = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'), m = n => d.currency + ' ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rows = items.map(i => `<tr><td>${h(i.desc)}</td><td>${i.qty}</td><td>${m(i.price)}</td><td>${m(i.qty * i.price)}</td></tr>`).join('');
    return res.type('application/msword').attachment(fname + '.doc').send(`<html><meta charset="utf-8"><body style="font-family:Arial"><h1>${d.type.toUpperCase()}</h1><p><b>${h(d.biz.name)}</b><br>${h(d.biz.phone)}<br>${h(d.biz.address)}</p><p>No: ${h(d.number)} &nbsp; Date: ${h(d.date)}</p><p><b>Bill to:</b> ${h(d.cust.name)} ${h(d.cust.contact)}</p><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Description</th><th>Qty</th><th>Price</th><th>Amount</th></tr>${rows}</table><p>Subtotal: ${m(sub)}<br>Discount: ${m(discount)}<br>Tax: ${m(tax)}<br>Other: ${m(fee)}<br><b>Total: ${m(t.total)}</b></p><p>${h(d.notes).replace(/\n/g, '<br>')}</p></body></html>`);
  }
  const lg = pro && typeof logo === 'string' && logo.length < 400000 ? makeInvoicePdf.parseJpeg(Buffer.from(logo, 'base64')) : null;
  const pdf = makeInvoicePdf(d, t, { watermark: !pro, logo: lg });
  if (!pro) invCount.set(key, (invCount.get(key) || 0) + 1);
  count(device);
  res.type('application/pdf').attachment(fname + '.pdf').send(pdf);
});

app.post('/api/admin/stats', (req, res) => {
  if (!E.ADMIN_KEY || req.get('x-admin-key') !== E.ADMIN_KEY) return res.status(404).end();
  const c = [...stats.values()];
  res.json({ counting_since: startedAt, documents_made: totalDocs, different_people: c.length, made_2_or_more: c.filter(n => n >= 2).length, made_5_or_more: c.filter(n => n >= 5).length });
});

// ---- Manual payments (bank transfer / WhatsApp): you make a code, the customer redeems it ----
const usedCodes = new Set();   // resets on restart; codes also expire after 7 days
const codeSig = (n, x, p) => sign('code:' + n + x + p).slice(0, 10);
app.post('/api/admin/code', (req, res) => {
  if (!E.ADMIN_KEY || req.get('x-admin-key') !== E.ADMIN_KEY) return res.status(404).end();
  const p = req.body.plan === 'day' ? 'd' : 'm', nonce = crypto.randomBytes(4).toString('hex'), exp36 = (Date.now() + 7 * 864e5).toString(36);
  res.json({ code: `${nonce}-${exp36}-${p}-${codeSig(nonce, exp36, p)}` });
});
app.post('/api/redeem', (req, res) => {
  const [nonce, exp36, p, sig] = String(req.body.code || '').trim().toLowerCase().split('-');
  if (!nonce || !exp36 || !['d', 'm'].includes(p) || sig !== codeSig(nonce, exp36, p) || parseInt(exp36, 36) < Date.now())
    return res.status(400).json({ error: 'Invalid or expired code.' });
  if (usedCodes.has(nonce)) return res.status(400).json({ error: 'This code was already used.' });
  usedCodes.add(nonce); res.json(makeToken(p === 'd' ? 'day' : 'month'));
});

const planOf = d => d.metadata?.plan === 'day' ? 'day' : 'month';
const priceFor = d => (d.currency === 'USD'
  ? (USD_ON ? (planOf(d) === 'day' ? PRICE_DAY_USD : PRICE_USD) : Infinity)
  : (planOf(d) === 'day' ? PRICE_DAY : PRICE)) * 100;

// ---- Paystack (Nigeria): one payment = 30 days of Pro ----
const paystack = (p, opt = {}) => fetch('https://api.paystack.co/' + p, {
  ...opt, headers: { Authorization: 'Bearer ' + E.PAYSTACK_SECRET_KEY, 'content-type': 'application/json' }
}).then(r => r.json());

app.post('/api/checkout', async (req, res) => {
  if (!E.PAYSTACK_SECRET_KEY) return res.status(500).json({ error: 'Paystack not configured.' });
  const { email, currency, plan } = req.body, usd = currency === 'USD' && USD_ON, day = plan === 'day';
  if (!/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'Enter a valid email.' });
  const j = await paystack('transaction/initialize', { method: 'POST',
    body: JSON.stringify({ email, amount: (usd ? (day ? PRICE_DAY_USD : PRICE_USD) : (day ? PRICE_DAY : PRICE)) * 100, currency: usd ? 'USD' : 'NGN', callback_url: BASE + '/', metadata: { plan: day ? 'day' : 'month' } }) });
  j.status ? res.json({ url: j.data.authorization_url }) : res.status(502).json({ error: j.message || 'Paystack error' });
});

app.get('/api/verify', async (req, res) => {
  const ref = String(req.query.reference || '');
  if (!ref || usedRefs.has(ref)) return res.status(402).json({ error: 'Invalid or already used payment.' });
  const j = await paystack('transaction/verify/' + encodeURIComponent(ref));
  if (j.status && j.data?.status === 'success' && j.data.amount >= priceFor(j.data) && Date.now() - new Date(j.data.paid_at) < 2 * 36e5) { usedRefs.add(ref); return res.json(makeToken(planOf(j.data))); }
  res.status(402).json({ error: 'Payment not confirmed.' });
});

app.use((req, res) => req.path.startsWith('/api')
  ? res.status(404).json({ error: 'Not found' })
  : res.status(404).type('html').send('<meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Page not found</h2><a href="/">Back to Billo</a>'));
app.listen(E.PORT || 3000, () => console.log('Billo on ' + BASE));
