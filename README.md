# A96 Ventures

Official platform and management system for **A96 Ventures**, featuring a high-performance public website and an enterprise admin portal for inventory management, bullion/idol transactions, location tracking, and role-based staff permissions.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router with Turbopack)
- **UI & Runtime**: React 19 & TypeScript 5
- **Styling**: Tailwind CSS v4 (Custom design tokens, fluid typography, dark/light grayscale contrasts)
- **Database & Auth**:
  - Firebase Client SDK (Firestore Lite, Firebase Auth, App Check)
  - Firebase Admin SDK (Server-side API routes, atomic transactions, privilege enforcement)
- **Media Management**: Cloudinary (Secure signed uploads, automatic WebP/AVIF format optimization)
- **Validation & Forms**: Zod & React Hook Form

---

## Project Architecture

```
src/
├── app/
│   ├── (public)/                 # Public marketing & investor pages
│   │   ├── page.tsx              # Homepage / Hero
│   │   ├── about/page.tsx        # Firm philosophy & thesis
│   │   ├── portfolio/            # Portfolio showcase & [slug] case studies
│   │   ├── brands/page.tsx       # Partner & venture brand listings
│   │   ├── team/page.tsx         # Leadership & partners
│   │   └── contact/page.tsx      # Secure investor & customer inquiry form
│   ├── admin/                    # Authenticated administrative back-office
│   │   ├── layout.tsx            # Protected admin layout & navigation
│   │   ├── login/page.tsx        # Staff authentication
│   │   ├── inventory/page.tsx    # Catalog, Bullions & Idols, Purchases, Movements
│   │   ├── sales/page.tsx        # POS register, returns, reversing entries
│   │   ├── locations/page.tsx    # Store & vault location management
│   │   ├── users/page.tsx        # Staff users, role presets, store locks, audit trail
│   │   ├── reports/page.tsx      # Sales volume, revenue & product analytics
│   │   ├── inquiries/page.tsx    # Customer inquiries inbox & status pipeline
│   │   ├── brands/page.tsx       # Brand portfolio content editor
│   │   ├── portfolio/page.tsx    # Venture portfolio content editor
│   │   └── team/page.tsx         # Team members content editor
│   └── api/                      # Protected server API routes
│       ├── admin/
│       │   ├── transactions/     # Atomic ledger entries, reversals & zero-balance
│       │   ├── products/         # SKU uniqueness enforcement & archiving
│       │   ├── users/            # Auth user sync & role-based permissions
│       │   └── auth/sync/        # Token exchange & session sync
│       ├── sign-cloudinary-params/ # Server-signed image upload validation
│       └── revalidate/           # On-demand ISR cache revalidation
├── components/                   # Reusable UI & design system primitives
├── hooks/                        # Custom React hooks (forms, inquiries, data)
└── lib/                          # Core utilities, services & Firebase clients
    ├── firebase/                 # Client config & Firebase Admin initialization
    ├── services/                 # Inventory, sales, audit, and user services
    └── utils/                    # Weight conversions, date IST formatting, CSV blobs
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and populate the necessary keys:

```bash
cp .env.example .env.local
```

### Required Variables:

1. **Firebase Client SDK** (`NEXT_PUBLIC_FIREBASE_*`):
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`

2. **Firebase Admin SDK** (Used securely in server API routes):
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (Enclosed in quotes with line breaks or `\n`)

3. **Cloudinary** (Image dropzone & optimization):
   - `CLOUDINARY_URL`
   - `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
   - `NEXT_PUBLIC_CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
   - `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the public site, or [http://localhost:3000/admin](http://localhost:3000/admin) to access the admin portal.

### 3. Run ESLint
```bash
npm run lint
```

### 4. Build for Production
```bash
npm run build
```

---

## Core Operations & Best Practices

- **Zero-Deletion Ledger**: Product inventory and ledger entries use immutable reversing transactions to preserve full audit traceability. Deleting a transaction creates a reversing entry linked to the original rather than rewriting history.
- **Micro-Weight Precision**: Bullion and Idol weights are calculated and stored in integer milligrams (`weightMg`, `pieceWeightsMg`) internally to eliminate JavaScript floating-point rounding errors, and rendered to 3 decimal places in the UI.
- **Timezone Awareness**: All financial dates and business transactions are formatted in Indian Standard Time (`Asia/Kolkata`).
- **Paginated Ledger Queries**: Transactions are queried with date range filters and cursor-based pagination, with local state optimistic updates following writes to minimize database read costs and avoid full-table reloads.

---

## Deployment Steps

### Deploy to Vercel

1. Push your repository to GitHub, GitLab, or Bitbucket.
2. Import the project in [Vercel](https://vercel.com).
3. Set the Framework Preset to **Next.js**.
4. Configure all environment variables from `.env.local` into the Vercel Project Settings under **Environment Variables**.
5. Deploy. Turbopack and Next.js 16 will build static pages and configure serverless API routes automatically.

### Deploy via Docker / Node Server

```bash
npm run build
npm run start
```
Ensure production environment variables are passed to the container runtime.
