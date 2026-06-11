import admin from 'firebase-admin';

export interface User {
  id: string;
  uid: string;
  firebaseUid: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  role: 'customer' | 'admin';
  walletId: string;
  pin: string | null;
  pinSetup: boolean;
  expoPushToken: string | null;
  isActive: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface Wallet {
  id: string;
  walletId: string;
  userId: string;
  balance: number;
  totalFunded: number;
  totalSpent: number;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface Transaction {
  id: string;
  walletId: string;
  userId: string;
  type: 'funding' | 'purchase' | 'transfer_sent' | 'transfer_received' | 'withdrawal';
  amount: number;
  fee: number;
  reference: string;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  paymentMethod?: 'paystack' | 'flutterwave' | 'wallet';
  metadata?: Record<string, unknown>;
  createdAt: admin.firestore.Timestamp;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  description: string;
  imageUrl: string;
  costPrice: number;
  sellingPrice: number;
  profitPerUnit: number;
  quantity: number;
  totalAdded: number;
  totalSold: number;
  lowStockThreshold: number;
  isActive: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface Order {
  id: string;
  receiptNumber: string;
  userId: string;
  walletId: string;
  items: OrderItem[];
  subtotal: number;
  total: number;
  status: 'pending' | 'completed' | 'cancelled';
  issued: boolean;
  issuedAt?: admin.firestore.Timestamp;
  issuedBy?: string;
  createdAt: admin.firestore.Timestamp;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  totalPrice: number;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  orderId: string;
  userId: string;
  userName: string;
  walletId: string;
  items: OrderItem[];
  subtotal: number;
  total: number;
  pdfUrl?: string;
  createdAt: admin.firestore.Timestamp;
}

export interface Transfer {
  id: string;
  senderWalletId: string;
  senderUserId: string;
  recipientWalletId: string;
  recipientUserId: string;
  amount: number;
  fee: number;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: admin.firestore.Timestamp;
}

export interface StockHistory {
  id: string;
  productId: string;
  type: 'added' | 'sold' | 'adjusted';
  quantity: number;
  costPrice?: number;
  previousStock: number;
  newStock: number;
  reference: string;
  createdAt: admin.firestore.Timestamp;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, unknown>;
  ip?: string;
  createdAt: admin.firestore.Timestamp;
}

export interface LoyaltyPoint {
  id: string;
  userId: string;
  points: number;
  totalPurchases: number;
  totalSpent: number;
  rewardTier: 'bronze' | 'silver' | 'gold' | 'platinum';
  updatedAt: admin.firestore.Timestamp;
}

export interface InventoryAlert {
  id: string;
  productId: string;
  productName: string;
  type: 'low_stock' | 'out_of_stock';
  currentStock: number;
  threshold: number;
  acknowledged: boolean;
  createdAt: admin.firestore.Timestamp;
}

export interface UserNotification {
  id: string;
  userId: string;
  type: 'wallet_funded' | 'transfer_sent' | 'transfer_received' | 'purchase_completed' | 'info';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: admin.firestore.Timestamp;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AppVersion {
  version: string;
  versionCode: number;
  apkLink: string;
  releaseNotes?: string;
  forceUpdate: boolean;
  updatedAt: admin.firestore.Timestamp;
  updatedBy: string;
}

export interface WebhookPayload {
  id: string;
  event: string;
  provider: 'paystack' | 'flutterwave';
  reference: string;
  payload: Record<string, unknown>;
  status: 'received' | 'processed' | 'error';
  errorMessage?: string;
  createdAt: admin.firestore.Timestamp;
  processedAt?: admin.firestore.Timestamp;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'customer' | 'admin';
  walletId?: string;
}
