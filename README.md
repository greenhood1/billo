# Billo – invoice & receipt maker

Make an invoice or receipt, preview it live, download a PDF, share it on WhatsApp.
Documents: invoices, receipts and quotes. Free: 3 PDFs a month with a footer line. Everyone: mark paid, make a receipt from an invoice, backup and restore. Pro (24-hour pass or 30 days): unlimited PDFs, your logo, Word export, saved customers, saved items, unpaid tracker with WhatsApp reminders, unlimited history.
Limits and exports are enforced on the server (`/api/invoice`), not in the browser.

## Deploy from an Android phone
1. Extract the zip. On GitHub create a NEW repository (for example `billo`) and upload ALL files (open the extracted folder, select everything).
2. render.com > New > Web Service > connect the new repo. Runtime Node, Build `npm install`, Start `npm start`, plan Free.
3. Environment: add the settings from `env-example.txt` (SECRET, BASE_URL, PAYSTACK_SECRET_KEY, ADMIN_KEY, WHATSAPP_NUMBER, SUPPORT_EMAIL, GA_ID, prices). Do not add DEV_PRO.
4. After the first deploy, set BASE_URL to your real onrender.com address and redeploy. Open /health (should say ok).
5. Create a NEW Google Analytics property for Billo and put its G- ID in GA_ID.
6. `/admin` generates day-pass or 30-day access codes for manual (transfer) payments.

## Notes
- Same Paystack account can be used for both of your products (keys are per account).
- Render's free plan has limited free hours shared across services. Keep only the busiest service awake with UptimeRobot.
- Free-limit counts and used codes reset when the server restarts. Add a database before heavy use.
- PDFs show money as NGN 1,000.00 because the standard PDF font cannot draw the naira sign.
