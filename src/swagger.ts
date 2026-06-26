import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'RAD5 Café API',
      version: '1.0.0',
      description: 'RAD5 Café Wallet & Smart Inventory System — Backend API. All authenticated endpoints require a Firebase ID token via `Authorization: Bearer <token>`. Admin endpoints additionally require the `admin` role.',
      contact: { name: 'RAD5 Tech Hub' },
    },
    servers: [
      { url: 'http://localhost:5000/api', description: 'Local development' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'Firebase ID Token',
          description: 'Firebase Auth ID token obtained from firebase.auth().currentUser.getIdToken()',
        },
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object', description: 'Response payload (varies by endpoint)' },
            error: { type: 'string', description: 'Error message (on failure)' },
          },
          required: ['success', 'message'],
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'array', items: {} },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            uid: { type: 'string', example: 'RAD5000001' },
            firebaseUid: { type: 'string' },
            fullName: { type: 'string' },
            phoneNumber: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['customer', 'admin'] },
            walletId: { type: 'string' },
            pinSetup: { type: 'boolean' },
            expoPushToken: { type: 'string', nullable: true },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Wallet: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            walletId: { type: 'string' },
            userId: { type: 'string' },
            balance: { type: 'number', example: 5000 },
            totalFunded: { type: 'number' },
            totalSpent: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            walletId: { type: 'string' },
            userId: { type: 'string' },
            type: { type: 'string', enum: ['funding', 'purchase', 'transfer_sent', 'transfer_received', 'withdrawal'] },
            amount: { type: 'number' },
            fee: { type: 'number' },
            reference: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
            paymentMethod: { type: 'string', enum: ['paystack', 'flutterwave', 'wallet'] },
            metadata: { type: 'object' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Transfer: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            senderWalletId: { type: 'string' },
            senderUserId: { type: 'string' },
            recipientWalletId: { type: 'string' },
            recipientUserId: { type: 'string' },
            amount: { type: 'number' },
            fee: { type: 'number' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            categoryId: { type: 'string' },
            description: { type: 'string' },
            imageUrl: { type: 'string' },
            costPrice: { type: 'number' },
            sellingPrice: { type: 'number' },
            profitPerUnit: { type: 'number' },
            quantity: { type: 'integer' },
            totalAdded: { type: 'integer' },
            totalSold: { type: 'integer' },
            lowStockThreshold: { type: 'integer' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Category: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        OrderItem: {
          type: 'object',
          properties: {
            productId: { type: 'string' },
            productName: { type: 'string' },
            quantity: { type: 'integer' },
            unitPrice: { type: 'number' },
            costPrice: { type: 'number' },
            totalPrice: { type: 'number' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            receiptNumber: { type: 'string', example: 'RCP-00001' },
            userId: { type: 'string' },
            walletId: { type: 'string' },
            items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
            subtotal: { type: 'number' },
            total: { type: 'number' },
            status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
            issued: { type: 'boolean' },
            issuedBy: { type: 'string', nullable: true },
            issuedAt: { type: 'string', format: 'date-time', nullable: true },
            cancelledBy: { type: 'string', nullable: true },
            cancelledAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Receipt: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            receiptNumber: { type: 'string', example: 'RCP-00001' },
            orderId: { type: 'string' },
            userId: { type: 'string' },
            userName: { type: 'string' },
            walletId: { type: 'string' },
            items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
            subtotal: { type: 'number' },
            total: { type: 'number' },
            pdfUrl: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        StockHistory: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            productId: { type: 'string' },
            type: { type: 'string', enum: ['added', 'sold', 'adjusted'] },
            quantity: { type: 'integer' },
            costPrice: { type: 'number' },
            previousStock: { type: 'integer' },
            newStock: { type: 'integer' },
            reference: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        InventoryAlert: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            productId: { type: 'string' },
            productName: { type: 'string' },
            type: { type: 'string', enum: ['low_stock', 'out_of_stock'] },
            currentStock: { type: 'integer' },
            threshold: { type: 'integer' },
            acknowledged: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AuditLog: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            action: { type: 'string' },
            resource: { type: 'string' },
            resourceId: { type: 'string' },
            details: { type: 'object' },
            ip: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        UserNotification: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            type: { type: 'string', enum: ['wallet_funded', 'transfer_sent', 'transfer_received', 'purchase_completed', 'info'] },
            title: { type: 'string' },
            body: { type: 'string' },
            data: { type: 'object' },
            isRead: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        DashboardStats: {
          type: 'object',
          properties: {
            today: { type: 'object' },
            inventory: { type: 'object' },
            customers: { type: 'object' },
            wallet: { type: 'object' },
          },
        },
        RevenueDataPoint: {
          type: 'object',
          properties: {
            period: { type: 'string' },
            revenue: { type: 'number' },
            profit: { type: 'number' },
            salesCount: { type: 'integer' },
          },
        },
        TopProducts: {
          type: 'object',
          properties: {
            bestSelling: { type: 'array', items: {} },
            highestProfit: { type: 'array', items: {} },
          },
        },
        CustomerInsights: {
          type: 'object',
          properties: {
            mostActive: { type: 'array', items: {} },
            highestSpending: { type: 'array', items: {} },
          },
        },
        ProfitAnalytics: {
          type: 'object',
          properties: {
            productProfit: { type: 'array', items: {} },
            dailyProfit: { type: 'array', items: {} },
            monthlyProfit: { type: 'array', items: {} },
            lifetimeProfit: { type: 'number' },
          },
        },
        UnsplashImage: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            urls: { type: 'object' },
            alt_description: { type: 'string' },
            user: { type: 'object' },
          },
        },
        WalletBalance: {
          type: 'object',
          properties: {
            balance: { type: 'number', example: 5000 },
            walletId: { type: 'string' },
          },
        },
        FundingInitResponse: {
          type: 'object',
          properties: {
            authorizationUrl: { type: 'string', description: 'Payment gateway URL to redirect user to' },
            reference: { type: 'string', description: 'Payment reference for verification' },
          },
        },
        RecipientValidation: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            name: { type: 'string', description: "Recipient's full name (if valid)" },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error description' },
            error: { type: 'string' },
          },
        },
        // Paystack wallet funding schemas
        PaymentInitRequest: {
          type: 'object',
          required: ['amount'],
          properties: {
            amount: { type: 'number', minimum: 100, description: 'Amount in Naira (minimum 100)', example: 500 },
          },
        },
        PaymentInitResponse: {
          type: 'object',
          properties: {
            authorizationUrl: { type: 'string', description: 'Paystack hosted payment page URL' },
            reference: { type: 'string', description: 'Unique payment reference' },
            accessCode: { type: 'string', description: 'Paystack access code' },
            amount: { type: 'number', description: 'Amount in smallest currency unit (kobo)' },
            displayAmount: { type: 'string', example: '500 NGN' },
          },
        },
        PaymentVerifyRequest: {
          type: 'object',
          required: ['reference'],
          properties: {
            reference: { type: 'string', description: 'Payment reference from initialization' },
          },
        },
        PaymentVerifyResult: {
          type: 'object',
          properties: {
            reference: { type: 'string' },
            alreadyApplied: { type: 'boolean', description: 'True if payment was previously processed (idempotent)' },
            transactionId: { type: 'string' },
            amount: { type: 'number' },
            walletCredited: { type: 'boolean', description: 'False if payment was already applied' },
          },
        },
      },
    },
    tags: [
      { name: 'Health', description: 'Server health check' },
      { name: 'Auth', description: 'User profile and PIN management' },
      { name: 'Wallet', description: 'Balance, funding, and transaction history' },
      { name: 'Transfers', description: 'P2P wallet transfers' },
      { name: 'Products', description: 'Product CRUD and inventory management' },
      { name: 'Categories', description: 'Product category management' },
      { name: 'Orders', description: 'Order placement and receipts' },
      { name: 'Analytics', description: 'Admin dashboard and analytics' },
      { name: 'Reports', description: 'Admin Excel report downloads' },
      { name: 'Users', description: 'Admin user management' },
      { name: 'Search', description: 'Product and category search' },
      { name: 'Images', description: 'Unsplash image search for products' },
      { name: 'Notifications', description: 'Inventory alerts and audit logs' },
      { name: 'Payments', description: 'Paystack wallet funding flow with webhooks — idempotent' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          description: 'Returns server status and environment info.',
          responses: {
            200: {
              description: 'Server is running',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      message: { type: 'string', example: 'RAD5 Café API is running' },
                      timestamp: { type: 'string', format: 'date-time' },
                      environment: { type: 'string', example: 'development' },
        },
      },

      // Paystack Wallet Funding Payment Endpoints
      '/payments/initiate': {
        post: {
          tags: ['Payments'],
          summary: 'Initiate wallet funding via Paystack',
          description: 'Creates a pending funding record and returns a Paystack hosted payment URL. The user completes payment in a WebView/browser, then the webhook/callback/verify paths confirm and credit their wallet balance.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaymentInitRequest' },
              },
            },
          },
          responses: {
            200: { description: 'Payment initialized — redirect user to authorizationUrl', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Invalid amount or Paystack error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/payments/webhook': {
        post: {
          tags: ['Payments'],
          summary: 'Paystack webhook (HMAC-SHA512 verified)',
          description: 'Receives charge.success events from Paystack. Signature is verified with node:crypto HMAC-SHA512. Idempotent — safe to receive duplicate events.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    event: { type: 'string', example: 'charge.success' },
                    data: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Payment processed or acknowledged', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            401: { description: 'Invalid or missing HMAC signature', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/payments/callback': {
        get: {
          tags: ['Payments'],
          summary: 'Paystack browser redirect callback',
          description: 'Paystack redirects the user here after payment. Server verifies with Paystack API, finalizes the payment, and redirects to the frontend success/failure URL.',
          parameters: [
            { name: 'reference', in: 'query', schema: { type: 'string' }, description: 'Payment reference' },
            { name: 'trxref', in: 'query', schema: { type: 'string' }, description: 'Transaction reference (Paystack alias)' },
          ],
          responses: {
            302: { description: 'Redirects to frontend wallet/funding/success or wallet/funding/failed' },
          },
        },
      },
      '/payments/verify': {
        post: {
          tags: ['Payments'],
          summary: 'Manual client-side funding verification',
          description: 'Fallback for verifying completed wallet funding. Calls the same idempotent finalizePaystackPayment() as webhook/callback. Safe to call multiple times.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaymentVerifyRequest' },
              },
            },
          },
          responses: {
            200: { description: 'Payment verified and wallet credited', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Payment not found or not successful on Paystack', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
    },
              },
            },
          },
        },
      },

      // ─── Auth ────────────────────────────────────────────
      '/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get authenticated user profile',
          description: 'Returns the current user profile. Auto-creates user document and wallet on first call.',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'User profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            401: { description: 'Missing or invalid token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/auth/profile': {
        get: {
          tags: ['Auth'],
          summary: 'Get full profile',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Full user profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
        put: {
          tags: ['Auth'],
          summary: 'Update profile',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    fullName: { type: 'string' },
                    phoneNumber: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Profile updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/auth/setup-pin': {
        post: {
          tags: ['Auth'],
          summary: 'Set up 4-digit transaction PIN',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['pin'],
                  properties: {
                    pin: { type: 'string', description: 'Exactly 4 digits', example: '1234' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'PIN set up', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/auth/change-pin': {
        post: {
          tags: ['Auth'],
          summary: 'Change transaction PIN',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['oldPin', 'newPin'],
                  properties: {
                    oldPin: { type: 'string', description: 'Current 4-digit PIN', example: '1234' },
                    newPin: { type: 'string', description: 'New 4-digit PIN', example: '5678' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'PIN changed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/auth/expo-push-token': {
        post: {
          tags: ['Auth'],
          summary: 'Save Expo push notification token',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token'],
                  properties: {
                    token: { type: 'string', description: 'Expo push notification token' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Token saved', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },

      // ─── Wallet ──────────────────────────────────────────
      '/wallet/balance': {
        get: {
          tags: ['Wallet'],
          summary: 'Get wallet balance',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Wallet balance', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },
      '/wallet/info': {
        get: {
          tags: ['Wallet'],
          summary: 'Get full wallet info',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Wallet details', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },
      '/wallet/fund/initialize': {
        post: {
          tags: ['Wallet'],
          summary: 'Initialize wallet funding',
          description: 'Creates a payment request with Paystack or Flutterwave. Returns an authorization URL.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['amount', 'provider'],
                  properties: {
                    amount: { type: 'number', minimum: 1, example: 5000 },
                    provider: { type: 'string', enum: ['paystack', 'flutterwave'] },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Payment initialized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/wallet/fund/verify': {
        post: {
          tags: ['Wallet'],
          summary: 'Verify and complete payment',
          description: 'Verifies a payment reference and credits the wallet.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reference', 'provider'],
                  properties: {
                    reference: { type: 'string', description: 'Payment reference from initialization' },
                    provider: { type: 'string', enum: ['paystack', 'flutterwave'] },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Payment verified', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Verification failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/wallet/transactions': {
        get: {
          tags: ['Wallet'],
          summary: 'Get paginated transactions (filterable)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['funding', 'purchase', 'transfer_sent', 'transfer_received', 'withdrawal'] } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            200: { description: 'Paginated transactions', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } },
          },
        },
      },
      '/wallet/transactions/all': {
        get: {
          tags: ['Wallet'],
          summary: 'Get all transactions (unfiltered, paginated)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            200: { description: 'Paginated transactions', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } },
          },
        },
      },

      // ─── Transfers ──────────────────────────────────────
      '/transfers/send': {
        post: {
          tags: ['Transfers'],
          summary: 'Send money to another wallet',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['recipientWalletId', 'amount'],
                  properties: {
                    recipientWalletId: { type: 'string', description: "Recipient's wallet ID" },
                    amount: { type: 'number', minimum: 1 },
                    description: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Transfer successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Transfer failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/transfers/validate': {
        post: {
          tags: ['Transfers'],
          summary: 'Validate recipient wallet exists',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['walletId'],
                  properties: {
                    walletId: { type: 'string', description: 'Wallet ID to validate' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Validation result', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/transfers/history': {
        get: {
          tags: ['Transfers'],
          summary: 'Get transfer history (sent transfers)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            200: { description: 'Paginated transfers', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } },
          },
        },
      },

      // ─── Products ───────────────────────────────────────
      '/products': {
        get: {
          tags: ['Products'],
          summary: 'List products (paginated, filterable)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Filter by category ID' },
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by name or description' },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          ],
          responses: {
            200: { description: 'Paginated products', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } },
          },
        },
        post: {
          tags: ['Products'],
          summary: 'Create new product',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'categoryId', 'costPrice', 'sellingPrice', 'quantity'],
                  properties: {
                    name: { type: 'string' },
                    categoryId: { type: 'string' },
                    description: { type: 'string' },
                    imageUrl: { type: 'string' },
                    costPrice: { type: 'number' },
                    sellingPrice: { type: 'number' },
                    quantity: { type: 'integer', minimum: 0 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Product created', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/products/{id}': {
        get: {
          tags: ['Products'],
          summary: 'Get product by ID',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Product details', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            404: { description: 'Product not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
        put: {
          tags: ['Products'],
          summary: 'Update product',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    categoryId: { type: 'string' },
                    description: { type: 'string' },
                    imageUrl: { type: 'string' },
                    costPrice: { type: 'number' },
                    sellingPrice: { type: 'number' },
                    isActive: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Product updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/products/{id}/restock': {
        post: {
          tags: ['Products'],
          summary: 'Restock product',
          description: 'Add stock to a product. Optionally update the cost price.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Product ID' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['quantity'],
                  properties: {
                    quantity: { type: 'integer', minimum: 1 },
                    newCostPrice: { type: 'number', description: 'New cost price per unit (optional)' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Stock updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/products/{id}/stock-history': {
        get: {
          tags: ['Products'],
          summary: 'Get stock history for a product',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Product ID' }],
          responses: {
            200: { description: 'Stock history entries', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/products/alerts/low-stock': {
        get: {
          tags: ['Products'],
          summary: 'Get low-stock products',
          description: 'Returns products where quantity is at or below the low stock threshold (default: 10).',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Low-stock products list', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },

      // ─── Categories ─────────────────────────────────────
      '/categories': {
        get: {
          tags: ['Categories'],
          summary: 'List active categories',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Categories list', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
        post: {
          tags: ['Categories'],
          summary: 'Create category',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Category created', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/categories/{id}': {
        get: {
          tags: ['Categories'],
          summary: 'Get category by ID',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Category details', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            404: { description: 'Category not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
        put: {
          tags: ['Categories'],
          summary: 'Update category',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    isActive: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Category updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
        delete: {
          tags: ['Categories'],
          summary: 'Delete category',
          description: 'Only succeeds if no products are associated with the category.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Category deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Cannot delete (has products)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },

      // ─── Orders ─────────────────────────────────────────
      '/orders': {
        post: {
          tags: ['Orders'],
          summary: 'Place an order (purchase)',
          description: 'Purchases items using wallet balance. Requires 4-digit PIN verification. Deducts stock and creates order, receipt, and transaction records atomically.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['items', 'pin'],
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['productId', 'quantity'],
                        properties: {
                          productId: { type: 'string' },
                          quantity: { type: 'integer', minimum: 1 },
                        },
                      },
                    },
                    pin: { type: 'string', description: '4-digit transaction PIN', example: '1234' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Purchase successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Insufficient stock, balance, or invalid PIN', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
        get: {
          tags: ['Orders'],
          summary: 'Get user order history',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            200: { description: 'Paginated orders', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } },
          },
        },
      },
      '/orders/receipt/{orderId}': {
        get: {
          tags: ['Orders'],
          summary: 'Get receipt by order ID',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Receipt details', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            404: { description: 'Receipt not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/orders/receipt-by-number/{receiptNumber}': {
        get: {
          tags: ['Orders'],
          summary: 'Get receipt by receipt number',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'receiptNumber', in: 'path', required: true, schema: { type: 'string' }, example: 'RCP-00001' }],
          responses: {
            200: { description: 'Receipt details', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            404: { description: 'Receipt not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },

      // ─── Admin Analytics ────────────────────────────────
      '/admin/analytics/dashboard': {
        get: {
          tags: ['Analytics'],
          summary: 'Dashboard overview',
          description: "Today's revenue, profit, sales counts; inventory stats; customer stats; wallet stats.",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Dashboard stats', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/admin/analytics/revenue': {
        get: {
          tags: ['Analytics'],
          summary: 'Revenue analytics over time',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'period', in: 'query', schema: { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'daily' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 30 } },
          ],
          responses: {
            200: { description: 'Revenue data points', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/admin/analytics/top-products': {
        get: {
          tags: ['Analytics'],
          summary: 'Best-selling and highest-profit products',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }],
          responses: {
            200: { description: 'Top products data', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/admin/analytics/customers': {
        get: {
          tags: ['Analytics'],
          summary: 'Most active and highest-spending customers',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }],
          responses: {
            200: { description: 'Customer insights', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/admin/analytics/profit': {
        get: {
          tags: ['Analytics'],
          summary: 'Profit analytics',
          description: 'Product-wise, daily, monthly, and lifetime profit breakdown.',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Profit data', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },

      // ─── Admin Reports ──────────────────────────────────
      '/admin/sales': {
        get: {
          tags: ['Reports'],
          summary: 'Export sales report (Excel)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'start', in: 'query', schema: { type: 'string', format: 'date' }, example: '2024-01-01' },
            { name: 'end', in: 'query', schema: { type: 'string', format: 'date' }, example: '2024-12-31' },
          ],
          responses: {
            200: { description: 'Excel file download (.xlsx)', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/admin/inventory': {
        get: {
          tags: ['Reports'],
          summary: 'Export inventory report (Excel)',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Excel file download (.xlsx)', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/admin/profit': {
        get: {
          tags: ['Reports'],
          summary: 'Export profit report (Excel)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'start', in: 'query', schema: { type: 'string', format: 'date' }, example: '2024-01-01' },
            { name: 'end', in: 'query', schema: { type: 'string', format: 'date' }, example: '2024-12-31' },
          ],
          responses: {
            200: { description: 'Excel file download (.xlsx)', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/admin/transactions': {
        get: {
          tags: ['Reports'],
          summary: 'Export transactions report (Excel)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'userId', in: 'query', schema: { type: 'string' }, description: 'Optional user filter' }],
          responses: {
            200: { description: 'Excel file download (.xlsx)', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },

      // ─── Admin Users ────────────────────────────────────
      '/admin/users': {
        get: {
          tags: ['Users'],
          summary: 'List users (paginated, safe)',
          description: 'Returns users without sensitive fields (pin/password excluded).',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            200: { description: 'Paginated users list', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/admin/users/{id}/toggle-status': {
        put: {
          tags: ['Users'],
          summary: 'Activate or deactivate a user',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'User ID' }],
          responses: {
            200: { description: 'User status toggled', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            404: { description: 'User not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },

      // ─── Search ─────────────────────────────────────────
      '/search/products': {
        get: {
          tags: ['Search'],
          summary: 'Search active products',
          description: 'Search by name or description. Optionally filter by category.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Search keyword' },
            { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Optional category ID filter' },
          ],
          responses: {
            200: { description: 'Matching products', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },
      '/search/categories': {
        get: {
          tags: ['Search'],
          summary: 'List active categories (sorted by name)',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Categories list', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },

      // ─── Images ─────────────────────────────────────────
      '/images/search': {
        get: {
          tags: ['Images'],
          summary: 'Search Unsplash for product images',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' }, example: 'pizza' },
            { name: 'count', in: 'query', schema: { type: 'integer', default: 10 } },
          ],
          responses: {
            200: { description: 'Unsplash image results', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            400: { description: 'Missing query', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },

      // ─── Notifications ──────────────────────────────────
      '/notifications/alerts': {
        get: {
          tags: ['Notifications'],
          summary: 'Get inventory alerts',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'acknowledged', in: 'query', schema: { type: 'boolean' }, description: 'Filter by acknowledgement status' },
          ],
          responses: {
            200: { description: 'Inventory alerts list', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/notifications/alerts/check': {
        post: {
          tags: ['Notifications'],
          summary: 'Scan inventory and generate alerts',
          description: 'Checks all products and creates alerts for those at or below their low stock threshold.',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Alerts generated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/notifications/alerts/{id}/acknowledge': {
        put: {
          tags: ['Notifications'],
          summary: 'Acknowledge an inventory alert',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Alert ID' }],
          responses: {
            200: { description: 'Alert acknowledged', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/notifications/audit-logs': {
        get: {
          tags: ['Notifications'],
          summary: 'Get audit logs (paginated)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          ],
          responses: {
            200: { description: 'Paginated audit logs', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } },
            403: { description: 'Admin required', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/notifications/user': {
        get: {
          tags: ['Notifications'],
          summary: 'Get user notifications (paginated)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            200: {
              description: 'Paginated user notifications',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      total: { type: 'integer' },
                      page: { type: 'integer' },
                      limit: { type: 'integer' },
                      notifications: { type: 'array', items: { $ref: '#/components/schemas/UserNotification' } },
                      data: { type: 'array', items: { $ref: '#/components/schemas/UserNotification' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/notifications/user/{id}/read': {
        put: {
          tags: ['Notifications'],
          summary: 'Mark user notification as read',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Notification ID' }],
          responses: {
            200: {
              description: 'Notification marked as read',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      message: { type: 'string', example: 'Notification marked as read' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      // ─── Admin Dashboard Endpoints ──────────────────────────
      '/admin-dashboard/auth/login': {
        post: {
          tags: ['Admin Dashboard'],
          summary: 'Superadmin login',
          description: 'Authenticates superadmin using email and password, returning a custom JWT.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email', example: 'admin@rad5cafe.com' },
                    password: { type: 'string', example: 'Admin@12345' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
            401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/admin-dashboard/auth/setup-pin': {
        post: {
          tags: ['Admin Dashboard'],
          summary: 'Set up Admin transaction PIN',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['pin'],
                  properties: {
                    pin: { type: 'string', pattern: '^\\d{4}$', example: '1234' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'PIN setup successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },
      '/admin-dashboard/auth/change-pin': {
        post: {
          tags: ['Admin Dashboard'],
          summary: 'Change Admin transaction PIN',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['oldPin', 'newPin'],
                  properties: {
                    oldPin: { type: 'string', example: '1234' },
                    newPin: { type: 'string', pattern: '^\\d{4}$', example: '5678' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'PIN changed successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },
      '/admin-dashboard/overview': {
        get: {
          tags: ['Admin Dashboard'],
          summary: 'Dashboard Overview Statistics',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Overview statistics', content: { 'application/json': { schema: { $ref: '#/components/schemas/DashboardStats' } } } },
          },
        },
      },
      '/admin-dashboard/products': {
        post: {
          tags: ['Admin Dashboard'],
          summary: 'Add product with PIN verification',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'categoryId', 'costPrice', 'sellingPrice', 'quantity', 'pin'],
                  properties: {
                    name: { type: 'string' },
                    categoryId: { type: 'string' },
                    description: { type: 'string' },
                    imageUrl: { type: 'string' },
                    costPrice: { type: 'number' },
                    sellingPrice: { type: 'number' },
                    quantity: { type: 'integer' },
                    lowStockThreshold: { type: 'integer' },
                    pin: { type: 'string', example: '1234' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Product added successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },
      '/admin-dashboard/products/{id}/restock': {
        post: {
          tags: ['Admin Dashboard'],
          summary: 'Restock product with PIN verification',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['quantity', 'pin'],
                  properties: {
                    quantity: { type: 'integer', example: 10 },
                    newCostPrice: { type: 'number', example: 150 },
                    pin: { type: 'string', example: '1234' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Product restocked successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },
      '/admin-dashboard/inventory-tracking': {
        get: {
          tags: ['Admin Dashboard'],
          summary: 'Inventory Tracking List',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          ],
          responses: {
            200: { description: 'Inventory tracking list', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } },
          },
        },
      },
      '/admin-dashboard/categories': {
        post: {
          tags: ['Admin Dashboard'],
          summary: 'Create Product Category',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', example: 'Drinks' },
                    description: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Category created', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },
      '/admin-dashboard/categories/{id}': {
        put: {
          tags: ['Admin Dashboard'],
          summary: 'Edit Product Category',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    isActive: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Category updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
        delete: {
          tags: ['Admin Dashboard'],
          summary: 'Delete Product Category',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Category deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },
      '/admin-dashboard/sales': {
        get: {
          tags: ['Admin Dashboard'],
          summary: 'Get All Sales (filterable & paginated)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'filter', in: 'query', schema: { type: 'string', enum: ['all', 'daily', 'weekly', 'monthly', 'custom'] } },
            { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            200: { description: 'Sales list', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } },
          },
        },
      },
      '/admin-dashboard/sales/{id}/adjust': {
        put: {
          tags: ['Admin Dashboard'],
          summary: 'Adjust order status (Refund & Stock revert if cancelled)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status', 'pin'],
                  properties: {
                    status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
                    pin: { type: 'string', example: '1234' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Order adjusted successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },
      '/admin-dashboard/analytics/revenue': {
        get: {
          tags: ['Admin Dashboard'],
          summary: 'Revenue Analytics Charts Data',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'period', in: 'query', schema: { type: 'string', enum: ['daily', 'weekly', 'monthly'] } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 30 } },
          ],
          responses: {
            200: { description: 'Revenue and profit chart points', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },
      '/admin-dashboard/analytics/top-products': {
        get: {
          tags: ['Admin Dashboard'],
          summary: 'Top Products Insights',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }],
          responses: {
            200: { description: 'Best selling and highest profit products', content: { 'application/json': { schema: { $ref: '#/components/schemas/TopProducts' } } } },
          },
        },
      },
      '/admin-dashboard/analytics/customers': {
        get: {
          tags: ['Admin Dashboard'],
          summary: 'Customer Insights',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }],
          responses: {
            200: { description: 'Most active and highest spending customers', content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerInsights' } } } },
          },
        },
      },
      '/admin-dashboard/analytics/profit': {
        get: {
          tags: ['Admin Dashboard'],
          summary: 'Profit Analytics',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Product, daily, monthly, and lifetime profit', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfitAnalytics' } } } },
          },
        },
      },
      '/admin-dashboard/alerts': {
        get: {
          tags: ['Admin Dashboard'],
          summary: 'Get Unacknowledged Stock Alerts',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Inventory alerts', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/InventoryAlert' } } } } },
          },
        },
      },
      '/admin-dashboard/alerts/{id}/acknowledge': {
        put: {
          tags: ['Admin Dashboard'],
          summary: 'Acknowledge Stock Alert',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Alert acknowledged', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },
      '/admin-dashboard/wallet/adjust': {
        post: {
          tags: ['Admin Dashboard'],
          summary: 'Adjust User Wallet Balance',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['userId', 'amount', 'pin'],
                  properties: {
                    userId: { type: 'string' },
                    amount: { type: 'number', description: 'Positive to credit, negative to debit' },
                    description: { type: 'string' },
                    pin: { type: 'string', example: '1234' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Wallet adjusted successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
          },
        },
      },
      '/admin-dashboard/reports/export': {
        get: {
          tags: ['Admin Dashboard'],
          summary: 'Export Reports (PDF, Excel, CSV)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'type', in: 'query', required: true, schema: { type: 'string', enum: ['sales', 'inventory', 'profit', 'transactions'] } },
            { name: 'format', in: 'query', required: true, schema: { type: 'string', enum: ['pdf', 'excel', 'csv'] } },
            { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'userId', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Report file download' },
          },
        },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
