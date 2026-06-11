# A96 Ventures

Early-stage venture capital focused on transformative technologies and exceptional founders.

## Tech Stack

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/                  # Next.js App Router pages
│   ├── layout.tsx        # Root layout (font, metadata, header/footer)
│   ├── globals.css       # Tailwind config, custom easings, animations
│   ├── page.tsx          # Home
│   ├── portfolio/        # Portfolio grid + [slug] detail pages
│   ├── brands/           # Brands page
│   ├── team/             # Team page
│   ├── insights/         # Insights page
│   ├── about/            # About page
│   └── contact/          # Contact form
├── components/           # Shared components
│   ├── header.tsx
│   ├── footer.tsx
│   ├── hero.tsx
│   └── newsletter-form.tsx
└── data/                 # Typed data modules
    ├── portfolio.ts
    ├── brands.ts
    ├── team.ts
    ├── insights.ts
    └── about.ts
```

## Build

```bash
npm run build
```

All pages are statically pre-rendered at build time.
