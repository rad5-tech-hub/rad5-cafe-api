# RAD5 Café API Documentation

**Base URL:** `http://localhost:5000/api`

**Interactive Docs:** `http://localhost:5000/api/docs`

**OpenAPI JSON:** `http://localhost:5000/api/docs.json`

---

## Overview

RAD5 Café API powers the wallet, inventory, and ordering system. It uses **Firebase Auth** for authentication and **Firestore** for data storage.

All authenticated endpoints require a **Firebase ID token** sent in the `Authorization: Bearer <token>` header. Admin endpoints additionally require the `admin` role on the user document.

### Response Format

```json
{
  "success": true | false,
  "message": "Human-readable status message",
  "data": { ... },
  "error": "Error details (on failure)",
  "total": 100,
  "page": 1,
  "limit": 20
}
```

### Rate Limiting

100 requests per 15-minute window per IP. Returns `429 Too Many Requests` when exceeded.

---

## Authentication Flow

1. Frontend authenticates via Firebase Auth (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, etc.)
2. Frontend gets an ID token: `firebase.auth().currentUser.getIdToken()`
3. Send the token in every API request header: `Authorization: Bearer <idToken>`
4. Backend verifies the token with Firebase Admin SDK
5. On first visit, backend **auto-creates** a Firestore `users` document and `wallets` document atomically
6. User fills in profile details later via `PUT /auth/profile`

**The backend never handles passwords** — Firebase manages all email/password auth. The only secret stored server-side is a bcrypt-hashed 4-digit **transaction PIN**.

---

## Endpoints

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | No | Server health check. Returns status, timestamp, environment. |

### Auth `/auth`

| Method | Endpoint | Auth | Body | Response |
|--------|----------|------|------|----------|
| `GET` | `/me` | Yes | — | User profile (auto-creates user + wallet on first call) |
| `GET` | `/profile` | Yes | — | Full user profile |
| `PUT` | `/profile` | Yes | `{ fullName?, phoneNumber? }` | `{ message: "Profile updated" }` |
| `POST` | `/setup-pin` | Yes | `{ pin }` — exactly 4 digits | `{ message: "PIN set up successfully" }` |
| `POST` | `/change-pin` | Yes | `{ oldPin, newPin }` | `{ message: "PIN changed successfully" }` |
| `POST` | `/expo-push-token` | Yes | `{ token }` — Expo push token | `{ message: "Push token saved" }` |
| `POST` | `/request-pin-change` | Yes | `{ pin }` — preferred PIN (4 digits) | `{ message: "PIN change request submitted successfully" }` |
| `GET` | `/pin-change-request` | Yes | — | Latest request details (excluding `preferredPin`) |


### Wallet `/wallet`

| Method | Endpoint | Auth | Body / Query | Response |
|--------|----------|------|-------------|----------|
| `GET` | `/balance` | Yes | — | `{ balance, walletId }` |
| `GET` | `/info` | Yes | — | Full wallet object |
| `POST` | `/fund/initialize` | Yes | `{ amount, provider }` — `"paystack"` or `"flutterwave"` | `{ authorizationUrl, reference }` |
| `POST` | `/fund/verify` | Yes | `{ reference, provider }` | Transaction details |
| `GET` | `/transactions` | Yes | `?type=funding\|purchase\|transfer_sent\|transfer_received&page=1&limit=20` | Paginated transaction list |
| `GET` | `/transactions/all` | Yes | `?page=1&limit=20` | Paginated transaction list (unfiltered) |

### Transfers `/transfers`

| Method | Endpoint | Auth | Body / Query | Response |
|--------|----------|------|-------------|----------|
| `POST` | `/send` | Yes | `{ recipientWalletId, amount, description? }` | `{ transferId, senderBalance }` |
| `POST` | `/validate` | Yes | `{ walletId }` | `{ valid, name? }` |
| `GET` | `/history` | Yes | `?page=1&limit=20` | Paginated sent transfers |

### Products `/products`

| Method | Endpoint | Auth | Body / Query | Response |
|--------|----------|------|-------------|----------|
| `GET` | `/` | Yes | `?category=catId&search=keyword&page=1&limit=50` | Paginated products |
| `GET` | `/:id` | Yes | — | Single product |
| `POST` | `/` | **Admin** | `{ name, categoryId, description?, imageUrl?, costPrice, sellingPrice, quantity }` | Created product (201) |
| `PUT` | `/:id` | **Admin** | `{ name?, categoryId?, description?, imageUrl?, costPrice?, sellingPrice?, isActive? }` | `{ message: "Product updated" }` |
| `POST` | `/:id/restock` | **Admin** | `{ quantity, newCostPrice? }` | Updated product |
| `GET` | `/:id/stock-history` | **Admin** | — | Stock history entries |
| `GET` | `/alerts/low-stock` | **Admin** | — | Products at or below low-stock threshold |

### Categories `/categories`

| Method | Endpoint | Auth | Body / Query | Response |
|--------|----------|------|-------------|----------|
| `GET` | `/` | Yes | — | All active categories |
| `GET` | `/:id` | Yes | — | Single category |
| `POST` | `/` | **Admin** | `{ name, description? }` | Created category (201) |
| `PUT` | `/:id` | **Admin** | `{ name?, description?, isActive? }` | `{ message: "Category updated" }` |
| `DELETE` | `/:id` | **Admin** | — | `{ message: "Category deleted" }` (fails if products exist) |

### Orders `/orders`

| Method | Endpoint | Auth | Body / Query | Response |
|--------|----------|------|-------------|----------|
| `POST` | `/` | Yes | `{ items: [{ productId, quantity }], pin }` | `{ order, receipt, balance }` (201) |
| `GET` | `/` | Yes | `?page=1&limit=20` | Paginated order history |
| `GET` | `/receipt/:orderId` | Yes | — | Receipt for order |
| `GET` | `/receipt-by-number/:receiptNumber` | Yes | — | Receipt by receipt number (e.g. `RCP-00001`) |

**Order processing steps:**
1. Validates user's 4-digit PIN
2. Checks stock availability for all items
3. Checks wallet balance covers the total
4. Atomic Firestore transaction: deducts stock, creates order/receipt/transaction, updates wallet

### Admin — Analytics `/admin/analytics`

| Method | Endpoint | Auth | Query | Response |
|--------|----------|------|-------|----------|
| `GET` | `/dashboard` | **Admin** | — | Today's revenue/profit/sales, inventory, customer & wallet stats |
| `GET` | `/revenue` | **Admin** | `?period=daily\|weekly\|monthly&limit=30` | Revenue data over time |
| `GET` | `/top-products` | **Admin** | `?limit=10` | Best-selling & highest-profit products |
| `GET` | `/customers` | **Admin** | `?limit=10` | Most active & highest-spending customers |
| `GET` | `/profit` | **Admin** | — | Product-wise, daily, monthly, lifetime profit |

### Admin — Reports `/admin` (Excel downloads)

| Method | Endpoint | Auth | Query | Response |
|--------|----------|------|-------|----------|
| `GET` | `/sales` | **Admin** | `?start=2024-01-01&end=2024-12-31` | `sales-report-*.xlsx` download |
| `GET` | `/inventory` | **Admin** | — | `inventory-report-*.xlsx` download |
| `GET` | `/profit` | **Admin** | `?start=...&end=...` | `profit-report-*.xlsx` download |
| `GET` | `/transactions` | **Admin** | `?userId=...` (optional) | `transactions-report-*.xlsx` download |

### Admin — User Management `/admin`

| Method | Endpoint | Auth | Body / Query | Response |
|--------|----------|------|-------------|----------|
| `GET` | `/users` | **Admin** | `?page=1&limit=20` | Paginated users (sanitized — no pin/password) |
| `PUT` | `/users/:id/toggle-status` | **Admin** | — | `{ message: "User activated/deactivated" }` |
| `GET` | `/pin-change-requests` | **Admin** | `?status=PENDING&page=1&limit=20` | Paginated pin change requests |
| `POST` | `/pin-change-requests/:id/approve` | **Admin** | `{ pin }` — User's preferred PIN | `{ message: "PIN change request approved and PIN updated" }` |
| `POST` | `/pin-change-requests/:id/reject` | **Admin** | `{ reason? }` | `{ message: "PIN change request rejected" }` |


### Search `/search`

| Method | Endpoint | Auth | Query | Response |
|--------|----------|------|-------|----------|
| `GET` | `/products` | Yes | `?q=keyword&category=catId` | Matching active products |
| `GET` | `/categories` | Yes | — | Active categories sorted by name |

### Images `/images`

| Method | Endpoint | Auth | Query | Response |
|--------|----------|------|-------|----------|
| `GET` | `/search` | **Admin** | `?q=pizza&count=10` | Unsplash image results |

### Notifications `/notifications`

| Method | Endpoint | Auth | Body / Query | Response |
|--------|----------|------|-------------|----------|
| `GET` | `/alerts` | **Admin** | `?acknowledged=true\|false` | Inventory alert list |
| `POST` | `/alerts/check` | **Admin** | — | Scan inventory, create alerts for low/out-of-stock products |
| `PUT` | `/alerts/:id/acknowledge` | **Admin** | — | `{ message: "Alert acknowledged" }` |
| `GET` | `/audit-logs` | **Admin** | `?page=1&limit=50` | Paginated audit log entries |

---

## Payment Providers

### Paystack (Wallet Funding) `/payments`

Wallet funding uses a robust zero-SDK Paystack integration with HMAC-SHA512 webhook verification and idempotent processing via an `appliedPayments` ledger. Users fund their wallet with Naira, and the balance is used to place orders.

| Method | Endpoint | Auth | Body / Query | Response |
|--------|----------|------|-------------|----------|
| `POST` | `/payments/initiate` | Yes | `{ amount }` — amount in Naira (minimum 100) | `{ authorizationUrl, reference, amount, displayAmount }` |
| `POST` | `/payments/webhook` | No (HMAC) | Raw JSON body from Paystack | `{ message, alreadyApplied, transactionId }` |
| `GET` | `/payments/callback` | No | `?reference=REF` (browser redirect) | Redirects to success/failure URL |
| `POST` | `/payments/verify` | Yes | `{ reference }` | `{ alreadyApplied, transactionId, amount }` |

**Flow:**
1. **Client** calls `POST /api/payments/initiate` with an `amount` in Naira (e.g. `{ "amount": 500 }`)
2. Backend creates a pending funding record in the `pendingTokenPurchases` Firestore collection
3. Backend calls Paystack `POST /transaction/initialize` to get a hosted `authorizationUrl`
4. **User pays** in the Paystack WebView/browser
5. Confirmation arrives via three converging paths that all call the **single `finalizePaystackPayment()` function**:

   | Path | Method | Trigger | Verification |
   |------|--------|---------|-------------|
   | **Webhook** | `POST /payments/webhook` | Paystack server-side `charge.success` event | HMAC-SHA512 signature verified with `node:crypto` |
   | **Callback** | `GET /payments/callback` | Paystack redirects user's browser after payment | Verifies with Paystack API, then finalizes |
   | **Manual Verify** | `POST /payments/verify` | Client polls manually with the reference | Verifies with Paystack API, then finalizes |

6. `finalizePaystackPayment()`:
   - First verifies the transaction with Paystack's GET `/transaction/verify/:reference` endpoint
   - Then runs an **atomic Firestore transaction** that:
     - Checks the `appliedPayments/ledger` document for idempotency (map of `reference → timestamp`)
     - Credits the user's wallet balance
     - Creates a completed `Transaction` record (type: `funding`, method: `paystack`)
     - Marks the pending funding record as `completed`
     - Records the reference in the ledger
   - **Race condition proof**: simultaneous webhook + callback won't double-credit

**Environment Variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PAYSTACK_SECRET_KEY` | Yes | — | Paystack secret key (sk_xxx) |
| `APP_BASE_URL` | Yes | `http://localhost:5000` | Backend base URL for callback |
| `CURRENCY` | No | `NGN` | ISO 4217 currency code |

**Legacy Wallet Funding:**
The `POST /wallet/fund/initialize` and `POST /wallet/fund/verify` endpoints remain available for direct wallet top-ups via Paystack and Flutterwave. See the Wallet section above for details.

---

## Error Codes

| Status | Meaning |
|--------|---------|
| `400` | Bad request — missing or invalid parameters |
| `401` | Unauthorized — missing, expired, or invalid Firebase token |
| `403` | Forbidden — insufficient permissions (admin required or deactivated account) |
| `404` | Not found — resource does not exist |
| `429` | Too many requests — rate limit exceeded |
| `500` | Internal server error |

---

## Models

### User
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Equals `firebaseUid` |
| `uid` | string | Human-friendly ID (e.g. `RAD5000001`) |
| `firebaseUid` | string | Firebase Auth UID |
| `fullName` | string | |
| `phoneNumber` | string | |
| `email` | string | |
| `role` | `"customer" \| "admin"` | |
| `walletId` | string | Linked wallet ID |
| `pin` | string \| null | bcrypt-hashed 4-digit PIN |
| `pinSetup` | boolean | |
| `expoPushToken` | string \| null | Expo push token |
| `isActive` | boolean | |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

### Product
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `name` | string | |
| `categoryId` | string | |
| `description` | string | |
| `imageUrl` | string | |
| `costPrice` | number | |
| `sellingPrice` | number | |
| `profitPerUnit` | number | Computed as `sellingPrice - costPrice` |
| `quantity` | number | Current stock level |
| `totalAdded` | number | Lifetime stock added |
| `totalSold` | number | Lifetime units sold |
| `lowStockThreshold` | number | Default 10 |
| `isActive` | boolean | |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

### Wallet
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `walletId` | string | Unique wallet ID |
| `userId` | string | Owning user |
| `balance` | number | Current balance |
| `totalFunded` | number | Lifetime funds added |
| `totalSpent` | number | Lifetime spent |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

### Transaction
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `walletId` | string | |
| `userId` | string | |
| `type` | `"funding" \| "purchase" \| "transfer_sent" \| "transfer_received" \| "withdrawal"` | |
| `amount` | number | |
| `fee` | number | |
| `reference` | string | Unique reference |
| `description` | string | |
| `status` | `"pending" \| "completed" \| "failed"` | |
| `paymentMethod` | `"paystack" \| "flutterwave" \| "wallet"` | Optional |
| `metadata` | object | Optional metadata |
| `createdAt` | Timestamp | |

### Order
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `receiptNumber` | string | e.g. `RCP-00001` |
| `userId` | string | |
| `walletId` | string | |
| `items` | OrderItem[] | |
| `subtotal` | number | Sum of item totals |
| `total` | number | Equals subtotal |
| `status` | `"pending" \| "completed" \| "cancelled"` | |
| `createdAt` | Timestamp | |

### OrderItem
| Field | Type | Notes |
|-------|------|-------|
| `productId` | string | |
| `productName` | string | |
| `quantity` | number | |
| `unitPrice` | number | Selling price at time of purchase |
| `costPrice` | number | Cost price at time of purchase |
| `totalPrice` | number | `unitPrice × quantity` |

### Receipt
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `receiptNumber` | string | e.g. `RCP-00001` |
| `orderId` | string | |
| `userId` | string | |
| `userName` | string | |
| `walletId` | string | |
| `items` | OrderItem[] | |
| `subtotal` | number | |
| `total` | number | |
| `pdfUrl` | string \| null | |
| `createdAt` | Timestamp | |

### Transfer
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `senderWalletId` | string | |
| `senderUserId` | string | |
| `recipientWalletId` | string | |
| `recipientUserId` | string | |
| `amount` | number | |
| `fee` | number | |
| `description` | string | |
| `status` | `"pending" \| "completed" \| "failed"` | |
| `createdAt` | Timestamp | |

### StockHistory
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `productId` | string | |
| `type` | `"added" \| "sold" \| "adjusted"` | |
| `quantity` | number | |
| `costPrice` | number \| undefined | |
| `previousStock` | number | |
| `newStock` | number | |
| `reference` | string | |
| `createdAt` | Timestamp | |

### InventoryAlert
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `productId` | string | |
| `productName` | string | |
| `type` | `"low_stock" \| "out_of_stock"` | |
| `currentStock` | number | |
| `threshold` | number | |
| `acknowledged` | boolean | |
| `createdAt` | Timestamp | |

### AuditLog
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `userId` | string | |
| `action` | string | |
| `resource` | string | |
| `resourceId` | string | |
| `details` | object | |
| `ip` | string \| undefined | |
| `createdAt` | Timestamp | |
