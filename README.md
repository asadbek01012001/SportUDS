# SportUDS — Sport Monitoringi Tizimi

UDS texnologiyasi va AI asosida sportchilarning kuch va tezkor-kuch ko'rsatkichlarini monitoring qilish tizimi.

## Loyiha tuzilmasi

```
SportUDS.Web/
├── backend/          # Node.js + TypeScript + PostgreSQL
└── frontend/         # React.js + Ant Design
```

## Boshlash uchun

### 1. PostgreSQL bazasini yarating

```sql
CREATE DATABASE sportuds;
```

### 2. Backend o'rnatish

```bash
cd backend
npm install

# .env faylini sozlang (DB parolingizni kiriting)
# Migratsiyani ishga tushiring:
npx ts-node src/config/migrate.ts

# Serverni ishga tushiring:
npm run dev
```

Backend `http://localhost:5000` da ishlaydi.

### 3. Frontend o'rnatish

```bash
cd frontend
npm install
npm run dev
```

Frontend `http://localhost:3000` da ishlaydi.

## Kirish ma'lumotlari (default)

| Rol | Email | Parol |
|-----|-------|-------|
| Admin | admin@sportuds.uz | Admin@123456 |

## API endpointlar

### Auth
- `POST /api/auth/login` — Kirish
- `GET /api/auth/profile` — Profil
- `PUT /api/auth/change-password` — Parolni o'zgartirish

### Admin
- `GET /api/admin/stats` — Dashboard statistikasi
- `GET/POST /api/admin/users` — Foydalanuvchilar
- `PUT/DELETE /api/admin/users/:id` — Foydalanuvchi boshqaruvi
- `GET /api/admin/audit-log` — Audit jurnali

### Sportchilar
- `GET/POST /api/athletes` — Sportchilar ro'yxati
- `GET/PUT/DELETE /api/athletes/:id` — Sportchi boshqaruvi
- `GET /api/athletes/:id/sessions` — Sportchi sessiyalari

### Test sessiyalari
- `GET/POST /api/sessions` — Sessiyalar
- `GET /api/sessions/:id` — Sessiya ma'lumotlari
- `POST /api/sessions/:id/sensor-data` — Sensor ma'lumoti va UDS hisoblash
- `POST /api/sessions/:id/complete` — Sessiyani yakunlash
- `POST /api/sessions/:id/validate` — Sessiyani tasdiqlash

### Analitika
- `GET /api/analytics/dynamics/:athlete_id` — Sportchi dinamikasi
- `GET /api/analytics/pre-post/:athlete_id` — Yuklamaoldi/keyingi taqqoslash
- `GET /api/analytics/group-comparison` — Guruh taqqoslash
- `GET /api/analytics/recommendation/:athlete_id` — AI tavsiya

## UDS Formulalar

| Ko'rsatkich | Formula | Tavsif |
|-------------|---------|--------|
| P₀ | max | Maksimal izostatik kuch |
| Fmax | max(F) | Maksimal portlovchi kuch |
| tmax | t(Fmax) | Fmax ga yetish vaqti |
| J | Fmax / tmax | Tezkor-kuch indeksi |
| Q | 0.5×Fmax / t1 | Boshlang'ich kuch |
| G | 0.5×Fmax / t2 | Tezlashtiruvchi kuch |
| Vmax | S(Fmax) / tmax | Maksimal tezlik |
| Nmax | Fmax × Vmax | Maksimal quvvat |

## Foydalanuvchi rollari

| Rol | Imkoniyatlar |
|-----|-------------|
| **Admin** | Barcha funksiyalar + foydalanuvchi boshqaruvi |
| **Tadqiqotchi** | Protokollar, barcha ma'lumotlar, hisobotlar |
| **Murabbiy** | O'z guruhi sportchilari, testlar, tavsiyalar |
| **Operator** | Test o'tkazish, sensor ma'lumotlari saqlash |
| **Sportchi** | Faqat o'z natijalarini ko'rish |
