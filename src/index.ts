import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';
import { env } from './config/env.js';

import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import transferRoutes from './routes/transfers.js';
import categoryRoutes from './routes/categories.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import analyticsRoutes from './routes/analytics.js';
import imageRoutes from './routes/images.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import searchRoutes from './routes/search.js';
import paymentsRoutes from './routes/payments.js';
import adminDashboardRoutes from './routes/adminDashboard.js';
import { errorHandler } from './middleware/error.js';

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.app.corsOrigins, credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'RAD5 Café API is running',
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin/analytics', analyticsRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin-dashboard', adminDashboardRoutes);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'RAD5 Café API Documentation',
  customfavIcon: '',
}));

app.use('/api/docs.json', (_req, res) => {
  res.json(swaggerSpec);
});

app.use(errorHandler);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(env.port, () => {
    console.log(`\n  🚀 RAD5 Café API Server`);
    console.log(`  📡 Port: ${env.port}`);
    console.log(`  🌍 Environment: ${env.nodeEnv}`);
    console.log(`  📅 Started: ${new Date().toISOString()}\n`);
  });
}

export default app;
