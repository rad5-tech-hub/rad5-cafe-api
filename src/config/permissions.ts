// Canonical list of assignable admin-console permissions.
//
// A user with role 'admin' whose `permissions` field is undefined/null is a
// "full access" admin (the grandfathered/highest tier — matches historical
// behavior where every admin could see everything). A user with an explicit
// `permissions` array is a restricted sub-admin limited to those keys.
export const ADMIN_PERMISSIONS = [
  { key: 'inventory', label: 'Inventory', description: 'Stock levels, thresholds, restocking & categories' },
  { key: 'products', label: 'Add products', description: 'List new items on the menu' },
  { key: 'sales', label: 'Sales logs', description: 'Orders, refunds & daily takings' },
  { key: 'accounting', label: 'Accounting', description: 'Reconciliation & variance review' },
  { key: 'cash_orders', label: 'Cash orders', description: 'Review, reconcile & cancel cash orders' },
  { key: 'analytics', label: 'Analytics', description: 'Trends, top products & busy hours' },
  { key: 'stock_balance', label: 'Stock balance out', description: 'Write off stock loss against profit' },
  { key: 'expenses', label: 'Sales ledger / expenses', description: 'Record and review expenses' },
  { key: 'users', label: 'Users & access', description: 'Customer accounts, tiers & status' },
  { key: 'rewards', label: 'Rewards given', description: 'Points & cashback distributed' },
  { key: 'pin_changes', label: 'PIN approvals', description: 'Review pending PIN change requests' },
  { key: 'audit_logs', label: 'Audit logs', description: 'System activity trail' },
  { key: 'reports', label: 'Export reports', description: 'Download revenue & inventory reports' },
  { key: 'updates', label: 'App updates', description: 'Publish new Android release info' },
  { key: 'wallet_adjust', label: 'Wallet balance adjustments', description: 'Manually credit/debit customer wallets' },
] as const;

export type PermissionKey = typeof ADMIN_PERMISSIONS[number]['key'];

export const ADMIN_PERMISSION_KEYS: PermissionKey[] = ADMIN_PERMISSIONS.map((p) => p.key);

export function sanitizePermissions(input: unknown): PermissionKey[] {
  if (!Array.isArray(input)) return [];
  const set = new Set(ADMIN_PERMISSION_KEYS as string[]);
  return Array.from(new Set(input.filter((k): k is PermissionKey => typeof k === 'string' && set.has(k))));
}
