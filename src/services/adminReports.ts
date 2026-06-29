import puppeteer from 'puppeteer';
import { db, Timestamp } from '../config/firebase.js';
import { Order, Product, Transaction, User, Category } from '../types/index.js';
import { reportService } from './reports.js';

export class AdminReportsService {
  private async getSalesData(startDate?: Date, endDate?: Date) {
    let query = db.collection('orders') as FirebaseFirestore.Query;
    query = query.orderBy('createdAt', 'desc');

    if (startDate) {
      query = query.where('createdAt', '>=', Timestamp.fromDate(startDate));
    }
    if (endDate) {
      query = query.where('createdAt', '<=', Timestamp.fromDate(endDate));
    }

    const snapshot = await query.get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

    const uniqueUserIds = [...new Set(orders.map(o => o.userId))];
    const userDocs = uniqueUserIds.length > 0
      ? await db.getAll(...uniqueUserIds.map(id => db.collection('users').doc(id)))
      : [];

    const userNameMap = new Map<string, string>();
    for (const doc of userDocs) {
      if (doc.exists) {
        userNameMap.set(doc.id, (doc.data() as User).fullName || 'Unnamed Customer');
      }
    }

    const rows = [];
    let totalRevenue = 0;
    let totalProfit = 0;

    for (const order of orders) {
      if (order.reconciliationStatus === 'limbo') continue;
      const customerName = userNameMap.get(order.userId) || 'Unknown';

      const date = order.createdAt.toDate().toLocaleString();
      const items = order.items.map(i => `${i.productName} x${i.quantity}`).join(', ');
      const profit = order.items.reduce((sum, i) => sum + (i.unitPrice - i.costPrice) * i.quantity, 0);

      totalRevenue += order.total;
      totalProfit += profit;

      rows.push({
        receiptNumber: order.receiptNumber,
        date,
        customer: customerName,
        items,
        total: order.total,
        profit,
      });
    }

    return { rows, summary: { totalRevenue, totalProfit, count: orders.length } };
  }

  private async getInventoryData() {
    const snapshot = await db.collection('products')
      .where('isActive', '==', true)
      .orderBy('name', 'asc')
      .get();

    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
    const categoriesSnapshot = await db.collection('categories').get();
    const categoryMap = new Map<string, string>();
    categoriesSnapshot.docs.forEach(doc => {
      categoryMap.set(doc.id, (doc.data() as Category).name);
    });

    const rows = [];
    let totalValue = 0;
    let totalProducts = products.length;
    let lowStockCount = 0;

    for (const product of products) {
      const categoryName = categoryMap.get(product.categoryId) || 'Uncategorized';
      const remainingValue = product.quantity * product.costPrice;
      totalValue += remainingValue;
      if (product.quantity <= (product.lowStockThreshold || 10)) {
        lowStockCount++;
      }

      rows.push({
        name: product.name,
        category: categoryName,
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        profitPerUnit: product.profitPerUnit,
        totalAdded: product.totalAdded,
        totalSold: product.totalSold,
        quantity: product.quantity,
        remainingValue,
      });
    }

    return { rows, summary: { totalValue, totalProducts, lowStockCount } };
  }

  private async getProfitData(startDate?: Date, endDate?: Date) {
    let query = db.collection('orders') as FirebaseFirestore.Query;
    query = query.orderBy('createdAt', 'desc');

    if (startDate) query = query.where('createdAt', '>=', Timestamp.fromDate(startDate));
    if (endDate) query = query.where('createdAt', '<=', Timestamp.fromDate(endDate));

    const snapshot = await query.get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

    const rows = [];
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;

    for (const order of orders) {
      if (order.reconciliationStatus === 'limbo') continue;
      const date = order.createdAt.toDate().toLocaleString();
      for (const item of order.items) {
        const revenue = item.totalPrice;
        const cost = item.costPrice * item.quantity;
        const profit = (item.unitPrice - item.costPrice) * item.quantity;

        totalRevenue += revenue;
        totalCost += cost;
        totalProfit += profit;

        rows.push({
          receiptNumber: order.receiptNumber,
          date,
          product: item.productName,
          quantity: item.quantity,
          revenue,
          cost,
          profit,
        });
      }
    }

    return { rows, summary: { totalRevenue, totalCost, totalProfit } };
  }

  private async getTransactionsData(userId?: string) {
    let query = db.collection('transactions') as FirebaseFirestore.Query;
    query = query.orderBy('createdAt', 'desc');

    if (userId) {
      query = query.where('userId', '==', userId);
    }

    const snapshot = await query.get();
    const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));

    const rows = [];
    let totalFunded = 0;
    let totalSpent = 0;

    for (const txn of transactions) {
      const date = txn.createdAt.toDate().toLocaleString();
      if (txn.status === 'completed') {
        if (txn.type === 'funding') totalFunded += txn.amount;
        else if (txn.type === 'purchase') totalSpent += Math.abs(txn.amount);
      }

      rows.push({
        date,
        type: txn.type,
        reference: txn.reference,
        amount: txn.amount,
        status: txn.status,
        description: txn.description,
      });
    }

    return { rows, summary: { totalFunded, totalSpent, count: transactions.length } };
  }

  // Generate Excel report
  async generateExcel(type: string, startDate?: Date, endDate?: Date, userId?: string): Promise<any> {
    switch (type) {
      case 'sales':
        return reportService.generateSalesReport(startDate, endDate);
      case 'inventory':
        return reportService.generateInventoryReport();
      case 'profit':
        return reportService.generateProfitReport(startDate, endDate);
      case 'transactions':
        return reportService.generateCustomerTransactionsReport(userId);
      default:
        throw new Error('Invalid report type');
    }
  }

  // Generate CSV report
  async generateCsv(type: string, startDate?: Date, endDate?: Date, userId?: string): Promise<string> {
    let headers = '';
    let rowStrings: string[] = [];

    if (type === 'sales') {
      const { rows } = await this.getSalesData(startDate, endDate);
      headers = 'Receipt #,Date,Customer,Items,Total,Profit\n';
      rowStrings = rows.map(r => 
        `"${r.receiptNumber}","${r.date}","${r.customer}","${r.items.replace(/"/g, '""')}",${r.total},${r.profit}`
      );
    } else if (type === 'inventory') {
      const { rows } = await this.getInventoryData();
      headers = 'Product,Category,Cost Price,Selling Price,Profit/Unit,Total Added,Total Sold,Current Stock,Remaining Value\n';
      rowStrings = rows.map(r => 
        `"${r.name}","${r.category}",${r.costPrice},${r.sellingPrice},${r.profitPerUnit},${r.totalAdded},${r.totalSold},${r.quantity},${r.remainingValue}`
      );
    } else if (type === 'profit') {
      const { rows } = await this.getProfitData(startDate, endDate);
      headers = 'Receipt #,Date,Product,Quantity,Revenue,Cost,Profit\n';
      rowStrings = rows.map(r => 
        `"${r.receiptNumber}","${r.date}","${r.product}",${r.quantity},${r.revenue},${r.cost},${r.profit}`
      );
    } else if (type === 'transactions') {
      const { rows } = await this.getTransactionsData(userId);
      headers = 'Date,Type,Reference,Amount,Status,Description\n';
      rowStrings = rows.map(r => 
        `"${r.date}","${r.type}","${r.reference}",${r.amount},"${r.status}","${r.description.replace(/"/g, '""')}"`
      );
    } else {
      throw new Error('Invalid report type');
    }

    return headers + rowStrings.join('\n');
  }

  // Generate PDF report using Puppeteer
  async generatePdf(type: string, startDate?: Date, endDate?: Date, userId?: string): Promise<Buffer> {
    let title = '';
    let htmlContent = '';

    const timestamp = new Date().toLocaleString();

    if (type === 'sales') {
      title = 'Sales Report';
      const { rows, summary } = await this.getSalesData(startDate, endDate);
      const dateRange = startDate || endDate 
        ? `Period: ${startDate ? startDate.toLocaleDateString() : 'Beginning'} - ${endDate ? endDate.toLocaleDateString() : 'Today'}`
        : 'All Time';

      htmlContent = `
        <div class="summary-cards">
          <div class="card"><h3>Total Sales Count</h3><p>${summary.count}</p></div>
          <div class="card"><h3>Total Revenue</h3><p>₦${summary.totalRevenue.toLocaleString()}</p></div>
          <div class="card"><h3>Total Profit</h3><p>₦${summary.totalProfit.toLocaleString()}</p></div>
        </div>
        <h3>Details</h3>
        <table>
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.receiptNumber}</td>
                <td>${r.date}</td>
                <td>${r.customer}</td>
                <td>${r.items}</td>
                <td>₦${r.total.toLocaleString()}</td>
                <td>₦${r.profit.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'inventory') {
      title = 'Inventory Report';
      const { rows, summary } = await this.getInventoryData();
      htmlContent = `
        <div class="summary-cards">
          <div class="card"><h3>Total Products</h3><p>${summary.totalProducts}</p></div>
          <div class="card"><h3>Low Stock Products</h3><p>${summary.lowStockCount}</p></div>
          <div class="card"><h3>Remaining Asset Value</h3><p>₦${summary.totalValue.toLocaleString()}</p></div>
        </div>
        <h3>Details</h3>
        <table>
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Category</th>
              <th>Cost Price</th>
              <th>Selling Price</th>
              <th>Stock</th>
              <th>Total Added</th>
              <th>Total Sold</th>
              <th>Remaining Value</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><strong>${r.name}</strong></td>
                <td>${r.category}</td>
                <td>₦${r.costPrice.toLocaleString()}</td>
                <td>₦${r.sellingPrice.toLocaleString()}</td>
                <td>${r.quantity}</td>
                <td>${r.totalAdded}</td>
                <td>${r.totalSold}</td>
                <td>₦${r.remainingValue.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'profit') {
      title = 'Profit Margins Report';
      const { rows, summary } = await this.getProfitData(startDate, endDate);
      htmlContent = `
        <div class="summary-cards">
          <div class="card"><h3>Total Revenue</h3><p>₦${summary.totalRevenue.toLocaleString()}</p></div>
          <div class="card"><h3>Total Cost</h3><p>₦${summary.totalCost.toLocaleString()}</p></div>
          <div class="card"><h3>Net Profit</h3><p>₦${summary.totalProfit.toLocaleString()}</p></div>
        </div>
        <h3>Details</h3>
        <table>
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Date</th>
              <th>Product</th>
              <th>Quantity</th>
              <th>Revenue</th>
              <th>Cost</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.receiptNumber}</td>
                <td>${r.date}</td>
                <td>${r.product}</td>
                <td>${r.quantity}</td>
                <td>₦${r.revenue.toLocaleString()}</td>
                <td>₦${r.cost.toLocaleString()}</td>
                <td>₦${r.profit.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'transactions') {
      title = 'Customer Transactions Report';
      const { rows, summary } = await this.getTransactionsData(userId);
      htmlContent = `
        <div class="summary-cards">
          <div class="card"><h3>Total Transactions</h3><p>${summary.count}</p></div>
          <div class="card"><h3>Total Funded</h3><p>₦${summary.totalFunded.toLocaleString()}</p></div>
          <div class="card"><h3>Total Spent</h3><p>₦${summary.totalSpent.toLocaleString()}</p></div>
        </div>
        <h3>Details</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Reference</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.date}</td>
                <td><span class="badge badge-${r.type}">${r.type}</span></td>
                <td>${r.reference}</td>
                <td style="color: ${r.amount < 0 ? '#ef4444' : '#22c55e'}">₦${r.amount.toLocaleString()}</td>
                <td>${r.status}</td>
                <td>${r.description}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: 'Inter', system-ui, sans-serif;
            color: #1f2937;
            padding: 10px;
            font-size: 11px;
            line-height: 1.4;
          }
          header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .title-area h1 {
            font-size: 20px;
            margin: 0;
            color: #111827;
            font-weight: 800;
          }
          .title-area p {
            margin: 4px 0 0 0;
            color: #6b7280;
            font-size: 12px;
          }
          .meta-area {
            text-align: right;
            color: #6b7280;
          }
          .summary-cards {
            display: flex;
            gap: 15px;
            margin-bottom: 25px;
          }
          .card {
            flex: 1;
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 12px;
          }
          .card h3 {
            margin: 0 0 6px 0;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #6b7280;
          }
          .card p {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            color: #111827;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          th, td {
            text-align: left;
            padding: 8px 10px;
            border-bottom: 1px solid #e5e7eb;
          }
          th {
            background-color: #f3f4f6;
            color: #374151;
            font-weight: 600;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.03em;
          }
          tr:nth-child(even) td {
            background-color: #fafafa;
          }
          .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .badge-funding { background-color: #d1fae5; color: #065f46; }
          .badge-purchase { background-color: #fee2e2; color: #991b1b; }
          .badge-transfer_sent { background-color: #fef3c7; color: #92400e; }
          .badge-transfer_received { background-color: #e0f2fe; color: #075985; }
        </style>
      </head>
      <body>
        <header>
          <div class="title-area">
            <h1>${title}</h1>
            <p>RAD5 Café Smart Wallet & Inventory System</p>
          </div>
          <div class="meta-area">
            <div>Generated: ${timestamp}</div>
            <div>Admin Dashboard v2</div>
          </div>
        </header>
        ${htmlContent}
      </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' as any });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
      printBackground: true,
    });
    await browser.close();
    return Buffer.from(pdfBuffer);
  }
}

export const adminReportsService = new AdminReportsService();
