# RAD5 Café Admin Dashboard — API Documentation

This document describes the design, authentication mechanics, and usage instructions for the new **Admin Dashboard API endpoints** (v2) under `/api/admin-dashboard`.

---

## 1. Authentication & Access Control

The Admin Dashboard API supports **Dual Authentication**:
1. **Superadmin JWT Auth**: Specifically for the main superadmin. They log in with their email and password (hashed/salted locally in Firestore) to obtain a custom JWT token.
2. **Sub-admin/User Firebase Auth**: For other admins created and authenticated via standard Firebase Auth. They pass their standard Firebase ID token in the authorization header.

### Authorization Header
For all secure endpoints, pass the token as a Bearer token:
```http
Authorization: Bearer <token>
```
The authentication middleware automatically parses the token:
- If it is a valid custom JWT signed by the system's `JWT_SECRET`, it authenticates the superadmin.
- If it is a Firebase ID Token, it verifies it against Firebase Auth and checks if the user document has the role `'admin'`.

---

## 2. API Endpoints Reference

### 2.1 Authentication (Superadmin)

#### Login
* **Method**: `POST`
* **Path**: `/api/admin-dashboard/auth/login`
* **Description**: Log in with superadmin email and password. On first login, if the user doesn't have a password hash, it checks against the environment default password, hashes it, and saves it.
* **Request Body**:
  ```json
  {
    "email": "admin@rad5cafe.com",
    "password": "Admin@12345"
  }
  ```
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "Login successful",
    "token": "eyJhbGciOi...",
    "user": {
      "id": "ADMIN000001",
      "uid": "ADMIN000001",
      "email": "admin@rad5cafe.com",
      "fullName": "Café Admin",
      "role": "admin",
      "walletId": "ADMIN000001",
      "pinSetup": true
    }
  }
  ```

#### Setup Transaction PIN
* **Method**: `POST`
* **Path**: `/api/admin-dashboard/auth/setup-pin`
* **Headers**: `Authorization: Bearer <Superadmin_JWT>`
* **Description**: Setup a 4-digit PIN for confirming transaction activities.
* **Request Body**:
  ```json
  {
    "pin": "1234"
  }
  ```
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "Transaction PIN set up successfully"
  }
  ```

#### Change Transaction PIN
* **Method**: `POST`
* **Path**: `/api/admin-dashboard/auth/change-pin`
* **Headers**: `Authorization: Bearer <Superadmin_JWT>`
* **Request Body**:
  ```json
  {
    "oldPin": "1234",
    "newPin": "5678"
  }
  ```
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "Transaction PIN changed successfully"
  }
  ```

---

### 2.2 Dashboard Overview

#### Get Overview Stats
* **Method**: `GET`
* **Path**: `/api/admin-dashboard/overview`
* **Headers**: `Authorization: Bearer <token>`
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "data": {
      "today": {
        "revenue": 15000,
        "profit": 4500,
        "salesCount": 12
      },
      "inventory": {
        "totalProducts": 45,
        "lowStock": 3,
        "outOfStock": 1
      },
      "customers": {
        "total": 120,
        "active": 115
      },
      "wallet": {
        "totalValue": 450000,
        "totalTransactions": 612
      }
    }
  }
  ```

---

### 2.3 Inventory Management

#### Add Product
* **Method**: `POST`
* **Path**: `/api/admin-dashboard/products`
* **Headers**: `Authorization: Bearer <token>`
* **Description**: Adds a new product. Auto-calculates `profitPerUnit = sellingPrice - costPrice`. Requires Admin Transaction PIN.
* **Request Body**:
  ```json
  {
    "name": "Iced Vanilla Latte",
    "categoryId": "CAT123",
    "description": "Double espresso over ice with fresh vanilla milk",
    "imageUrl": "https://images.unsplash.com/...",
    "costPrice": 1200,
    "sellingPrice": 1800,
    "quantity": 50,
    "lowStockThreshold": 10,
    "pin": "1234"
  }
  ```
* **Success Response (201)**:
  ```json
  {
    "success": true,
    "message": "Product added successfully",
    "data": {
      "id": "PROD987",
      "name": "Iced Vanilla Latte",
      "categoryId": "CAT123",
      "description": "Double espresso over ice with fresh vanilla milk",
      "imageUrl": "https://images.unsplash.com/...",
      "costPrice": 1200,
      "sellingPrice": 1800,
      "profitPerUnit": 600,
      "quantity": 50,
      "totalAdded": 50,
      "totalSold": 0,
      "lowStockThreshold": 10,
      "isActive": true
    }
  }
  ```

#### Restock Inventory
* **Method**: `POST`
* **Path**: `/api/admin-dashboard/products/:id/restock`
* **Headers**: `Authorization: Bearer <token>`
* **Description**: Increases stock quantity. Updates cost price and profit per unit if a new cost price is provided. Maintains stock history records. Requires Admin Transaction PIN.
* **Request Body**:
  ```json
  {
    "quantity": 30,
    "newCostPrice": 1250,
    "pin": "1234"
  }
  ```
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "Product restocked successfully",
    "data": { ... }
  }
  ```

#### Inventory Tracking List
* **Method**: `GET`
* **Path**: `/api/admin-dashboard/inventory-tracking`
* **Headers**: `Authorization: Bearer <token>`
* **Query Parameters**: `page` (default 1), `limit` (default 50)
* **Description**: Lists products showing stock levels and remaining value (`quantity * costPrice`).
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "PROD987",
        "name": "Iced Vanilla Latte",
        "categoryId": "CAT123",
        "costPrice": 1200,
        "sellingPrice": 1800,
        "totalAdded": 80,
        "totalSold": 5,
        "currentStock": 75,
        "remainingValue": 90000
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
  ```

---

### 2.4 Product Categories

#### Create Category
* **Method**: `POST`
* **Path**: `/api/admin-dashboard/categories`
* **Headers**: `Authorization: Bearer <token>`
* **Request Body**:
  ```json
  {
    "name": "Drinks",
    "description": "Hot and cold coffee, tea, and soda juices"
  }
  ```
* **Success Response (201)**:
  ```json
  {
    "success": true,
    "message": "Category created successfully",
    "data": { ... }
  }
  ```

#### Edit Category
* **Method**: `PUT`
* **Path**: `/api/admin-dashboard/categories/:id`
* **Headers**: `Authorization: Bearer <token>`
* **Request Body**:
  ```json
  {
    "name": "Premium Drinks",
    "description": "Specialty espresso drinks",
    "isActive": true
  }
  ```
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "Category updated successfully"
  }
  ```

#### Delete Category
* **Method**: `DELETE`
* **Path**: `/api/admin-dashboard/categories/:id`
* **Headers**: `Authorization: Bearer <token>`
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "Category deleted successfully"
  }
  ```

---

### 2.5 Sales Management

#### Get Sales List
* **Method**: `GET`
* **Path**: `/api/admin-dashboard/sales`
* **Headers**: `Authorization: Bearer <token>`
* **Query Parameters**:
  - `filter`: `all` | `daily` | `weekly` | `monthly` | `custom`
  - `startDate`: ISO date string (for `custom` filter)
  - `endDate`: ISO date string (for `custom` filter)
  - `page`: default 1
  - `limit`: default 20
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "ORD001",
        "receiptNumber": "RCP-0001",
        "customerName": "John Doe",
        "items": [
          {
            "productId": "PROD987",
            "productName": "Iced Vanilla Latte",
            "quantity": 2,
            "unitPrice": 1800,
            "costPrice": 1200,
            "totalPrice": 3600
          }
        ],
        "revenue": 3600,
        "profit": 1200,
        "status": "completed",
        "date": "2026-06-03T12:00:00.000Z"
      }
    ],
    "total": 1
  }
  ```

#### Adjust Sale Status (Cancel/Refund)
* **Method**: `PUT`
* **Path**: `/api/admin-dashboard/sales/:id/adjust`
* **Headers**: `Authorization: Bearer <token>`
* **Description**: Adjusts order status. Setting status to `'cancelled'` refunds the order total amount to the customer's wallet balance and increments the product quantity back into stock. Requires Admin Transaction PIN.
* **Request Body**:
  ```json
  {
    "status": "cancelled",
    "pin": "1234"
  }
  ```
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "Order status adjusted to cancelled successfully"
  }
  ```

---

### 2.6 Revenue & Profit Analytics

#### Revenue Analytics
* **Method**: `GET`
* **Path**: `/api/admin-dashboard/analytics/revenue`
* **Headers**: `Authorization: Bearer <token>`
* **Query Parameters**: `period` (`daily` | `weekly` | `monthly`), `limit`
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "period": "2026-06-03",
        "revenue": 15000,
        "profit": 4500,
        "salesCount": 12
      }
    ]
  }
  ```

#### Top Products
* **Method**: `GET`
* **Path**: `/api/admin-dashboard/analytics/top-products`
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "data": {
      "bestSelling": [ ... ],
      "highestProfit": [ ... ]
    }
  }
  ```

#### Customer Insights
* **Method**: `GET`
* **Path**: `/api/admin-dashboard/analytics/customers`
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "data": {
      "mostActive": [ ... ],
      "highestSpending": [ ... ]
    }
  }
  ```

#### Profit Margins
* **Method**: `GET`
* **Path**: `/api/admin-dashboard/analytics/profit`
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "data": {
      "productProfit": [ ... ],
      "dailyProfit": 4500,
      "monthlyProfit": 125000,
      "lifetimeProfit": 850000
    }
  }
  ```

---

### 2.7 Inventory Alerts

#### Get Stock Alerts
* **Method**: `GET`
* **Path**: `/api/admin-dashboard/alerts`
* **Headers**: `Authorization: Bearer <token>`
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "ALERT001",
        "productId": "PROD987",
        "productName": "Iced Vanilla Latte",
        "type": "low_stock",
        "currentStock": 8,
        "threshold": 10,
        "acknowledged": false
      }
    ]
  }
  ```

#### Acknowledge Alert
* **Method**: `PUT`
* **Path**: `/api/admin-dashboard/alerts/:id/acknowledge`
* **Headers**: `Authorization: Bearer <token>`
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "Alert acknowledged successfully"
  }
  ```

---

### 2.8 Manual Wallet Operations

#### Adjust Wallet Balance
* **Method**: `POST`
* **Path**: `/api/admin-dashboard/wallet/adjust`
* **Headers**: `Authorization: Bearer <token>`
* **Description**: Manually fund or debit a customer's wallet. Logs a transaction and an audit log. Requires Admin Transaction PIN.
* **Request Body**:
  ```json
  {
    "userId": "USER123",
    "amount": 5000, // Pass negative number like -2000 to debit
    "description": "Compensation funding for billing issue",
    "pin": "1234"
  }
  ```
* **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "Wallet balance adjusted successfully",
    "data": {
      "balance": 12500
    }
  }
  ```

---

### 2.9 Reports Export

#### Export Report File
* **Method**: `GET`
* **Path**: `/api/admin-dashboard/reports/export`
* **Headers**: `Authorization: Bearer <token>`
* **Query Parameters**:
  - `type`: `sales` | `inventory` | `profit` | `transactions`
  - `format`: `pdf` | `excel` | `csv`
  - `startDate`: ISO date string (optional)
  - `endDate`: ISO date string (optional)
  - `userId`: String (optional, only for `transactions` filter)
* **Response**: File download stream. Content-Type is set depending on format:
  - `excel`: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `csv`: `text/csv`
  - `pdf`: `application/pdf`

---

## 3. Tracked Audit Actions
The following events write an immutable audit log to the `audit_logs` collection:
1. `'add_product'`: Logged on product creation.
2. `'restock_product'`: Logged on product restocking.
3. `'create_category'`, `'edit_category'`, `'delete_category'`: Logged on category operations.
4. `'adjust_sale'`: Logged on changing status / cancelling an order.
5. `'wallet_transaction'`: Logged on manual admin wallet funding/debiting.
