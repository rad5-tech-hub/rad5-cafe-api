import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { auth, db } from '../config/firebase';
import { env } from '../config/env';
import { User, JwtPayload } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        uid: string;
        email: string;
        role: 'customer' | 'admin';
        walletId?: string;
      };
    }
  }
}

export async function authenticateAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
      return;
    }

    const token = authHeader.split(' ')[1]!;

    // 1. Try Custom JWT first (Superadmin)
    try {
      const decoded = jwt.verify(token, env.jwt.secret) as JwtPayload;
      
      if (decoded.role !== 'admin') {
        res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
        return;
      }

      const userDoc = await db.collection('users').doc(decoded.userId).get();
      if (!userDoc.exists) {
        res.status(401).json({ success: false, message: 'User not found.' });
        return;
      }

      const user = userDoc.data() as User;
      if (!user.isActive) {
        res.status(403).json({ success: false, message: 'Account is deactivated.' });
        return;
      }

      req.user = {
        userId: userDoc.id,
        uid: user.uid,
        email: user.email,
        role: user.role,
        walletId: user.walletId,
      };
      return next();
    } catch (jwtError) {
      // If it is not a valid custom JWT, we fall back to Firebase ID token verification
    }

    // 2. Try Firebase ID Token (Sub-admin / Admin created via Firebase)
    try {
      const decoded = await auth.verifyIdToken(token);
      const firebaseUid = decoded.uid;

      const userDoc = await db.collection('users').doc(firebaseUid).get();
      if (!userDoc.exists) {
        res.status(401).json({ success: false, message: 'Admin account not found in database.' });
        return;
      }

      const user = userDoc.data() as User;
      if (user.role !== 'admin') {
        res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
        return;
      }

      if (!user.isActive) {
        res.status(403).json({ success: false, message: 'Account is deactivated.' });
        return;
      }

      req.user = {
        userId: userDoc.id,
        uid: user.uid,
        email: user.email,
        role: user.role,
        walletId: user.walletId,
      };
      return next();
    } catch (firebaseError) {
      // Both authentication methods failed
      res.status(401).json({ success: false, message: 'Invalid or expired token.' });
      return;
    }
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
}
