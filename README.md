# Doctor Clinic Management System (DCMS)

Production-ready, single-clinic OPD management system.

**Stack** — React (Vite) + MUI (white theme) · Node + Express (MVC) · PostgreSQL (via `pg`, no ORM) · JWT + bcrypt · Multer · pdf-lib (Letterpad overlay).

## Roles & workflow

```
Receptionist → Medical Officer → Doctor → Printed Prescription
```

| Role            | Default credential          |
| --------------- | --------------------------- |
| Admin (Doctor)  | `admin` / `Admin@123`       |
| Receptionist    | (created by admin in Users) |
| Medical Officer | (created by admin in Users) |

## One-time setup

### 1. PostgreSQL

```sql
CREATE DATABASE dcms;
```

### 2. Backend

```bash
cd backend
cp .env.example .env          # set PG creds + a strong JWT_SECRET
npm install
npm run db:init               # creates schema + seed + admin user
npm run dev                   # http://localhost:5000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

The Vite dev server proxies `/api` and `/uploads` to the backend.

## Folder structure

```
backend/
  src/
    config/          (env, pg pool)
    controllers/     (thin HTTP layer)
    database/        (schema.sql, seed.sql, init.js)
    middlewares/     (auth, rbac, errorHandler, audit, upload)
    routes/          (REST mounting)
    services/        (business logic + SQL)
    uploads/         (reports, letterpad)
    utils/           (jwt, idGenerator, validators, asyncHandler, HttpError)
  server.js

frontend/
  src/
    components/      (ProtectedRoute, ...)
    context/         (AuthContext, SnackbarContext)
    layouts/         (MainLayout: sidebar+navbar+breadcrumbs)
    pages/           (Login, Dashboard, PatientSearch, PatientRegister,
                      PatientHistory, MOQueue, MOVisit, DoctorQueue,
                      DoctorVisit, Visits, Masters, Users, Settings)
    services/        (axios + endpoint wrappers)
    theme.js
    main.jsx / App.jsx
```

## REST API (summary)

| Method | Path                          | Roles                             |
| ------ | ----------------------------- | --------------------------------- |
| POST   | /api/auth/login               | -                                 |
| GET    | /api/auth/me                  | Auth                              |
| POST   | /api/auth/logout              | Auth                              |
| GET    | /api/patients                 | Admin, Receptionist, MO           |
| POST   | /api/patients                 | Admin, Receptionist               |
| GET    | /api/patients/:id             | Admin, Receptionist, MO           |
| GET    | /api/patients/:id/history     | Admin, Receptionist, MO           |
| PUT    | /api/patients/:id/demographics| Admin, Receptionist               |
| POST   | /api/patients/:id/old-case    | Admin, Receptionist               |
| DELETE | /api/patients/:id             | Admin                             |
| GET    | /api/visits/search            | Admin, Receptionist, MO           |
| GET    | /api/visits/:id               | Admin, Receptionist, MO           |
| POST   | /api/visits/:id/cancel        | Admin                             |
| GET    | /api/mo/queue                 | Admin, MO                         |
| POST   | /api/mo/:visitId              | Admin, MO                         |
| GET    | /api/doctor/queue             | Admin                             |
| POST   | /api/doctor/:visitId          | Admin                             |
| GET    | /api/masters/:key             | Auth                              |
| POST   | /api/masters/:key             | Admin                             |
| PUT    | /api/masters/:key/:id         | Admin                             |
| DELETE | /api/masters/:key/:id         | Admin                             |
| POST   | /api/reports/upload           | Admin                             |
| GET    | /api/reports/patient/:id      | Admin, MO                         |
| DELETE | /api/reports/:id              | Admin                             |
| GET    | /api/dashboard                | Auth                              |
| GET    | /api/print/prescription/:id   | Admin                             |
| POST   | /api/print/letterpad          | Admin (multipart PDF)             |
| GET    | /api/users                    | Admin                             |
| POST   | /api/users                    | Admin                             |
| PUT    | /api/users/:id                | Admin                             |
| DELETE | /api/users/:id                | Admin                             |

Master keys: `languages`, `villages`, `referrals`, `known_disease_master`, `advice_master`, `examination_master`.

## Security

* JWT (12h default) + bcrypt cost-12
* Helmet, CORS allowlist, compression
* Rate limit (300 req/min/IP, login: 10/min/IP)
* Role-based middleware on every router
* Parameterised SQL everywhere (no string concatenation)
* File-type & size validation (PDF / JPG / PNG, ≤ 10 MB)
* Audit log on every mutation + login/logout

## Printing on the Letterpad

1. Upload a single-page PDF in **Settings → Clinic Letterpad** (admin).
2. The print service loads that PDF and overlays the prescription using the margins from `.env`:

```
PRINT_MARGIN_TOP=180
PRINT_MARGIN_LEFT=60
PRINT_MARGIN_RIGHT=60
PRINT_MARGIN_BOTTOM=120
```

3. If no letterpad is uploaded, a clean A4 prescription is generated from scratch.

## Patient vs Visit (important)

* `patients` row = the person, forever.
* `patient_visits` row = each consultation, with its own auto-incrementing global **Case Number**.
* "Old Case" creates a new visit on an existing patient; "New Case" creates a new patient and first visit.

## Production checklist

* Set a strong `JWT_SECRET` in `.env`.
* Change the default admin password.
* Configure `pg_hba.conf` to require password auth.
* Run a daily `pg_dump` of the `dcms` database and copy off-host.
* Put Nginx in front of the Node server (TLS + static `dist`).
* Restrict `/uploads` directory permissions to the Node process user.
