import ExcelJS from 'exceljs';
import { db, Timestamp } from '../config/firebase';
import { Order, Product, Transaction, User } from '../types';

const ORDERS_COLLECTION = 'orders';
const PRODUCTS_COLLECTION = 'products';
const TRANSACTIONS_COLLECTION = 'transactions';
const USERS_COLLECTION = 'users';

export class ReportService {
  async generateSalesReport(startDate?: Date, endDate?: Date): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sales Report');

    sheet.columns = [
      { header: 'Receipt #', key: 'receiptNumber', width: 20 },
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'Items', key: 'items', width: 40 },
      { header: 'Total', key: 'total', width: 15 },
      { header: 'Profit', key: 'profit', width: 15 },
    ];

    let query = db.collection(ORDERS_COLLECTION) as FirebaseFirestore.Query;
    query = query.orderBy('createdAt', 'desc');

    if (startDate) {
      query = query.where('createdAt', '>=', Timestamp.fromDate(startDate));
    }
    if (endDate) {
      query = query.where('createdAt', '<=', Timestamp.fromDate(endDate));
    }

    const snapshot = await query.get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

    for (const order of orders) {
      let customerName = 'Unknown';
      const userDoc = await db.collection(USERS_COLLECTION).doc(order.userId).get();
      if (userDoc.exists) {
        const user = userDoc.data() as User;
        customerName = user.fullName;
      }

      const date = order.createdAt.toDate();
      const items = order.items.map(i => `${i.productName} x${i.quantity}`).join(', ');
      const profit = order.items.reduce((sum, i) => sum + (i.unitPrice - i.costPrice) * i.quantity, 0);

      sheet.addRow({
        receiptNumber: order.receiptNumber,
        date: date.toLocaleDateString(),
        customer: customerName,
        items,
        total: order.total,
        profit,
      });
    }

    sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  async generateInventoryReport(): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inventory Report');

    sheet.columns = [
      { header: 'Product', key: 'name', width: 25 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Cost Price', key: 'costPrice', width: 15 },
      { header: 'Selling Price', key: 'sellingPrice', width: 15 },
      { header: 'Profit/Unit', key: 'profitPerUnit', width: 15 },
      { header: 'Total Added', key: 'totalAdded', width: 15 },
      { header: 'Total Sold', key: 'totalSold', width: 15 },
      { header: 'Current Stock', key: 'quantity', width: 15 },
      { header: 'Remaining Value', key: 'remainingValue', width: 15 },
    ];

    const snapshot = await db.collection(PRODUCTS_COLLECTION)
      .where('isActive', '==', true)
      .orderBy('name', 'asc')
      .get();

    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));

    for (const product of products) {
      sheet.addRow({
        name: product.name,
        category: product.categoryId,
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        profitPerUnit: product.profitPerUnit,
        totalAdded: product.totalAdded,
        totalSold: product.totalSold,
        quantity: product.quantity,
        remainingValue: product.quantity * product.costPrice,
      });
    }

    sheet.getRow(1).font = { bold: true };
    return workbook.xlsx.writeBuffer();
  }

  async generateProfitReport(startDate?: Date, endDate?: Date): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Profit Report');

    sheet.columns = [
      { header: 'Receipt #', key: 'receiptNumber', width: 20 },
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Product', key: 'product', width: 25 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Revenue', key: 'revenue', width: 15 },
      { header: 'Cost', key: 'cost', width: 15 },
      { header: 'Profit', key: 'profit', width: 15 },
    ];

    let query = db.collection(ORDERS_COLLECTION) as FirebaseFirestore.Query;
    query = query.orderBy('createdAt', 'desc');

    if (startDate) query = query.where('createdAt', '>=', Timestamp.fromDate(startDate));
    if (endDate) query = query.where('createdAt', '<=', Timestamp.fromDate(endDate));

    const snapshot = await query.get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

    for (const order of orders) {
      const date = order.createdAt.toDate();
      for (const item of order.items) {
        sheet.addRow({
          receiptNumber: order.receiptNumber,
          date: date.toLocaleDateString(),
          product: item.productName,
          quantity: item.quantity,
          revenue: item.totalPrice,
          cost: item.costPrice * item.quantity,
          profit: (item.unitPrice - item.costPrice) * item.quantity,
        });
      }
    }

    sheet.getRow(1).font = { bold: true };
    return workbook.xlsx.writeBuffer();
  }

  async generateCustomerTransactionsReport(userId?: string): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Transactions');

    sheet.columns = [
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Type', key: 'type', width: 20 },
      { header: 'Reference', key: 'reference', width: 25 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Description', key: 'description', width: 30 },
    ];

    let query = db.collection(TRANSACTIONS_COLLECTION) as FirebaseFirestore.Query;
    query = query.orderBy('createdAt', 'desc');

    if (userId) {
      query = query.where('userId', '==', userId);
    }

    const snapshot = await query.get();
    const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));

    for (const txn of transactions) {
      const date = txn.createdAt.toDate();
      sheet.addRow({
        date: date.toLocaleDateString(),
        type: txn.type,
        reference: txn.reference,
        amount: txn.amount,
        status: txn.status,
        description: txn.description,
      });
    }

    sheet.getRow(1).font = { bold: true };
    return workbook.xlsx.writeBuffer();
  }

  transactionsToCsv(transactions: Transaction[]): string {
    const headers = 'Date,Type,Reference,Amount,Status,Description\n';
    const rows = transactions.map(txn => {
      const date = txn.createdAt.toDate();
      return `${date.toISOString()},${txn.type},${txn.reference},${txn.amount},${txn.status},"${txn.description}"`;
    }).join('\n');
    return headers + rows;
  }
}

export const reportService = new ReportService();
