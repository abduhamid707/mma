# USTOZ MMA CRM — server-based MVP

Sodda MMA klub boshqaruv tizimi: dashboard, o‘quvchilar va profil, abonementlar, to‘lovlar, davomat, hisobotlar, JSON backup/import va administrator login.

## Talablar

- Node.js 20+
- PostgreSQL 16+ (Docker orqali ishga tushirish mumkin)
- npm

## Lokal ishga tushirish

1. `.env.example`dan `.env` yarating.
2. `POSTGRES_PASSWORD` (Docker uchun), `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (kamida 12 belgi), `SESSION_SECRET` (kamida 32 belgi) qiymatlarini yozing. Oson paroldan foydalanmang.
3. `docker compose up -d postgres`
4. `npm install`
5. `npm run check`
6. `npm run test`
7. `npm start`
8. Brauzer: http://localhost:3000

Birlamchi baza va jadvallar server ishga tushganda yaratiladi.

## Production talablar

- HTTPS (reverse proxy), `NODE_ENV=production`, `TRUST_PROXY` kerak bo‘lsa moslang.
- Administrator parolini faqat environment orqali kiriting.
- PostgreSQL bazani har kuni **server darajasida** backup qiling va restore tekshiring. Ilovadagi JSON backup qo‘lda olinadi, avtomatik emas.
- `npm run test` va brauzer E2E sinovlarini alohida o'tkazing.
- To‘lovlar buxgalteriya tizimi bilan integratsiyalanmagan, ma’lumotlar operator tomonidan qo‘lda kiritiladi.
- Hozir bitta administrator uchun. Backenddagi ma’lumotlar bitta JSONB hujjatda revision bilan saqlanadi; foydalanuvchilar soni oshsa normalizatsiya qilish tavsiya etiladi.
- Filiallar, o‘qituvchilar hisob-kitobi, SMS, QR va to‘lov provayderlari integratsiyasi bu MVP tarkibida emas.

## Diqqat

Tizim GitHub’ga yozilgan, lekin ushbu muhitda real PostgreSQL va brauzer end-to-end tekshiruvi qilinmaguncha ustozning haqiqiy mijozlar ma’lumotlarini kiritmang.
