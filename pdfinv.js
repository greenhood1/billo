// Dependency-free invoice/receipt PDF writer (A4, Helvetica, optional JPEG logo).
const FIX = s => String(s ?? '').replace(/\r/g, '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
  .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...').replace(/\u20A6/g, 'N').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
const ESC = s => FIX(s).replace(/[\\()]/g, '\\$&');
const wid = (s, size, bold) => { let w = 0; for (const c of FIX(s)) w += /[0-9]/.test(c) ? .556 : /[ ,.:;]/.test(c) ? .278 : c === '-' ? .333 : /[A-Z]/.test(c) ? .68 : /[iljtf]/.test(c) ? .28 : /[mw]/.test(c) ? .8 : .53; return w * size * (bold ? 1.04 : 1); };
const wrap = (s, maxW, size) => { const out = []; String(s || '').split('\n').forEach(par => { let line = ''; par.split(/\s+/).filter(Boolean).forEach(w => { const t = line ? line + ' ' + w : w; if (wid(t, size) > maxW && line) { out.push(line); line = w; } else line = t; }); out.push(line); }); return out; };
const num = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseJpeg(b) {   // read size/colour info from the file itself (never trust the client)
  if (!Buffer.isBuffer(b) || b.length < 100 || b.length > 300000 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xC2) { const comps = b[i + 9]; return comps === 1 || comps === 3 ? { data: b, h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), cs: comps === 1 ? 'DeviceGray' : 'DeviceRGB' } : null; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function makeInvoicePdf(d, t, o = {}) {
  const W = 595, H = 842, M = 45, R = W - M, G = [.35, .37, .42], pages = [];
  let c, y; const f = n => n.toFixed(1), money = n => d.currency + ' ' + num(n);
  const newPage = () => { c = []; pages.push(c); y = H - M; };
  const txt = (x, yy, s, size = 10, bold = false, rgb = [.1, .1, .15], al = 'l') => { const w = wid(s, size, bold); x = al === 'r' ? x - w : al === 'c' ? x - w / 2 : x; c.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb.join(' ')} rg ${f(x)} ${f(yy)} Td (${ESC(s)}) Tj ET\n`); };
  const rect = (x, yy, w, h, rgb) => c.push(`${rgb.join(' ')} rg ${f(x)} ${f(yy)} ${f(w)} ${f(h)} re f\n`);
  const line = (x1, yy, x2, rgb = [.88, .89, .92]) => c.push(`${rgb.join(' ')} RG 0.6 w ${f(x1)} ${f(yy)} m ${f(x2)} ${f(yy)} l S\n`);

  newPage();
  rect(0, H - 90, W, 90, [.02, .59, .41]);
  txt(M, H - 55, d.type.toUpperCase(), 28, true, [1, 1, 1]);
  txt(R, H - 40, 'No: ' + d.number, 11, true, [1, 1, 1], 'r');
  txt(R, H - 56, 'Date: ' + d.date, 10, false, [1, 1, 1], 'r');
  if (d.type !== 'receipt' && d.due) txt(R, H - 70, (d.type === 'quote' ? 'Valid until: ' : 'Due: ') + d.due, 10, false, [1, 1, 1], 'r');
  if (d.type === 'receipt' && d.method) txt(R, H - 70, 'Paid by: ' + d.method, 10, false, [1, 1, 1], 'r');
  y = H - 120;
  let bx = M;
  if (o.logo) { const s = Math.min(56 / o.logo.w, 56 / o.logo.h), lw = o.logo.w * s, lh = o.logo.h * s; c.push(`q ${f(lw)} 0 0 ${f(lh)} ${f(M)} ${f(y + 10 - lh)} cm /Im1 Do Q\n`); bx = M + 68; }
  txt(bx, y, d.biz.name, 14, true);
  let by = y - 16; [d.biz.phone, ...wrap(d.biz.address, 230, 10)].filter(Boolean).forEach(l => { txt(bx, by, l, 10, false, G); by -= 13; });
  txt(345, y, 'BILL TO', 9, true, [.45, .47, .55]); txt(345, y - 15, d.cust.name || '-', 12, true);
  let cy = y - 29; wrap(d.cust.contact, 205, 10).forEach(l => { txt(345, cy, l, 10, false, G); cy -= 13; });
  y = Math.min(by, cy, y - 66) - 24;

  const head = () => { rect(M, y - 6, R - M, 22, [.94, .95, .98]); const g = [.35, .37, .45];
    txt(M + 8, y + 1, 'DESCRIPTION', 8.5, true, g); txt(335, y + 1, 'QTY', 8.5, true, g, 'r'); txt(432, y + 1, 'PRICE', 8.5, true, g, 'r'); txt(R - 8, y + 1, 'AMOUNT', 8.5, true, g, 'r'); y -= 24; };
  head();
  d.items.forEach(it => {
    const ls = wrap(it.desc, 240, 10);
    if (y - ls.length * 13 < 70) { newPage(); head(); }
    ls.forEach((l, i) => txt(M + 8, y - i * 13, l, 10));
    txt(335, y, String(it.qty), 10, false, undefined, 'r'); txt(432, y, num(it.price), 10, false, undefined, 'r'); txt(R - 8, y, num(it.qty * it.price), 10, false, undefined, 'r');
    y -= (ls.length - 1) * 13 + 17; line(M, y + 10, R);
  });
  if (y < 190) newPage();
  y -= 8;
  const tl = (label, val, bold, size = 10, rgb) => { txt(345, y, label, size, bold); txt(R - 8, y, val, size, bold, rgb, 'r'); y -= 17; };
  tl('Subtotal', money(t.sub)); if (t.discount) tl('Discount', '- ' + money(t.discount));
  if (d.tax) tl(`Tax (${d.tax}%)`, money(t.tax)); if (t.fee) tl('Delivery / other', money(t.fee));
  line(345, y + 12, R, [.7, .72, .8]); y -= 4;
  if (d.type === 'receipt') txt(M, y, 'PAID', 30, true, [.06, .62, .35]);
  tl(d.type === 'receipt' ? 'TOTAL PAID' : d.type === 'quote' ? 'TOTAL' : 'TOTAL DUE', money(t.total), true, 13, [.02, .59, .41]);
  if (d.notes) {
    y -= 18; txt(M, y, 'NOTES / PAYMENT DETAILS', 9, true, [.45, .47, .55]); y -= 15;
    wrap(d.notes, 480, 10).slice(0, 14).forEach(l => { if (y < 50) newPage(); txt(M, y, l, 10, false, G); y -= 13; });
  }
  const n = pages.length;
  pages.forEach((p, i) => { c = p; if (o.watermark) txt(W / 2, 24, 'Made with Billo - upgrade to remove this line', 8, false, [.6, .62, .68], 'c'); if (n > 1) txt(R, 24, `Page ${i + 1} of ${n}`, 8, false, [.6, .62, .68], 'r'); });

  const parts = [], offs = []; let len = 0;
  const add = b => { b = Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1'); parts.push(b); len += b.length; };
  const obj = (k, body) => { offs[k] = len; add(k + ' 0 obj\n'); add(body); add('\nendobj\n'); };
  const base = o.logo ? 6 : 5;
  add('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => (base + i * 2) + ' 0 R').join(' ')}] >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  if (o.logo) obj(5, Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${o.logo.w} /Height ${o.logo.h} /ColorSpace /${o.logo.cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${o.logo.data.length} >>\nstream\n`), o.logo.data, Buffer.from('\nendstream')]));
  pages.forEach((p, i) => {
    const body = Buffer.from(p.join(''), 'latin1');
    obj(base + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${o.logo ? ' /XObject << /Im1 5 0 R >>' : ''} >> /Contents ${base + 1 + i * 2} 0 R >>`);
    obj(base + 1 + i * 2, Buffer.concat([Buffer.from(`<< /Length ${body.length} >>\nstream\n`), body, Buffer.from('\nendstream')]));
  });
  const total = base + n * 2, xref = len;
  add(`xref\n0 ${total}\n0000000000 65535 f \n` + offs.slice(1).map(x => String(x).padStart(10, '0') + ' 00000 n \n').join(''));
  add(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return Buffer.concat(parts);
}
module.exports = makeInvoicePdf; module.exports.parseJpeg = parseJpeg;
