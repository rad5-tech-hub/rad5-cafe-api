import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('Error:', err.message);

  const statusCode = getStatusCode(err.message);
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
}

function getStatusCode(message: string): number {
  const clientErrors = [
    'already registered',
    'already exists',
    'Invalid email or password',
    'not found',
    'Insufficient',
    'Invalid',
    'Cannot',
    'not set up',
    'is empty',
    'no longer available',
    'not be empty',
    'Current PIN',
  ];

  for (const error of clientErrors) {
    if (message.includes(error)) return 400;
  }

  if (message.includes('Access denied') || message.includes('Token')) return 401;
  if (message.includes('privileges')) return 403;

  return 500;
}
