# RAD5 Café API

Wallet & Smart Inventory System backend for RAD5 Café.

## Stack

- **Runtime:** [Bun](https://bun.com)
- **Framework:** Express.js v5 (TypeScript, ESM)
- **Database:** Firebase Firestore
- **Auth:** Firebase Auth + 4-digit transaction PIN (bcrypt)

## Quick Start

```bash
bun install
cp .env.example .env   # then fill in your keys
bun run dev            # http://localhost:5000
```

## API Docs

| Format | URL |
|--------|-----|
| Swagger UI | [http://localhost:5000/api/docs](http://localhost:5000/api/docs) |
| OpenAPI JSON | [http://localhost:5000/api/docs.json](http://localhost:5000/api/docs.json) |
| Markdown | [API.md](./API.md) |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start with hot reload |
| `bun run start` | Start production server |
| `bun run build` | Type-check with `tsc` |
| `bun run test` | Run test suite |
| `bun run lint` | Type-check with `tsc --noEmit` |

## Authentication

1. Frontend authenticates via Firebase Auth
2. Get ID token: `firebase.auth().currentUser.getIdToken()`
3. Send in header: `Authorization: Bearer <idToken>`
4. Backend auto-creates Firestore user + wallet on first request

Admin endpoints require `role: "admin"` on the user document.

## Environment Variables

See [.env.example](./.env.example) for all required variables.

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No (default 5000) | Server port |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | Full Firebase service account JSON |
| `PAYSTACK_SECRET_KEY` | No | Paystack secret key for wallet funding |
| `FLUTTERWAVE_SECRET_KEY` | No | Flutterwave secret key for wallet funding |
| `UNSPLASH_ACCESS_KEY` | No | Unsplash API key for image search |
| `CORS_ORIGIN` | No (default `http://localhost:3000`) | Allowed CORS origin |

## Routes

- `/api/health` — Health check
- `/api/auth` — Profile & PIN management
- `/api/wallet` — Balance, funding (Paystack/Flutterwave), transactions
- `/api/transfers` — P2P wallet transfers
- `/api/products` — Product CRUD & stock management
- `/api/categories` — Category CRUD
- `/api/orders` — Order placement & receipts
- `/api/admin/analytics` — Dashboard, revenue, profit stats
- `/api/admin` — Excel reports & user management
- `/api/search` — Product & category search
- `/api/images` — Unsplash image search
- `/api/notifications` — Inventory alerts & audit logs
