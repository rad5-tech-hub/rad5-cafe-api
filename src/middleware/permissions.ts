import { Request, Response, NextFunction } from 'express';
import { PermissionKey } from '../config/permissions.js';

export function hasFullAccess(user: { role: string; permissions?: string[] | null } | undefined): boolean {
  return !!user && user.role === 'admin' && (user.permissions === undefined || user.permissions === null);
}

/**
 * Allows the request through if the admin has full access (no restricted
 * permissions array), or if their permissions list includes at least one of
 * the given keys. Must run after `authenticate`/`authenticateAdmin`.
 */
export function requirePermission(...keys: PermissionKey[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      return;
    }

    if (hasFullAccess(req.user)) {
      next();
      return;
    }

    const perms = req.user.permissions || [];
    const allowed = keys.some((k) => perms.includes(k));
    if (!allowed) {
      res.status(403).json({ success: false, message: 'Access denied. You do not have permission to access this section.' });
      return;
    }
    next();
  };
}

/**
 * Restricted to full-access admins only — used for actions that affect
 * other admins' access (creating sub-admins, assigning permissions,
 * changing roles).
 */
export function requireFullAccessAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!hasFullAccess(req.user)) {
    res.status(403).json({ success: false, message: 'Access denied. Full admin privileges required.' });
    return;
  }
  next();
}
