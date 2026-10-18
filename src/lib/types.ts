export interface TeamMember {
  name: string;
  role: string;
  bio: string;
  expertise: string[];
  imageFile?: string;
  linkedin?: string;
}

export interface Brand {
  id: string;
  name: string;
  description: string;
  sector: string;
  logoFile: string;
}

export interface PortfolioCompany {
  name: string;
  description: string;
  stage: string;
  sector: string;
}

export interface Inquiry {
  id: string;
  name?: string; // Legacy
  firstName?: string;
  middleName?: string;
  lastName?: string;
  countryCode?: string;
  mobile?: string;
  email?: string;
  company?: string;
  gstinPan?: string;
  message: string;
  inquiryType: string;
  status?: 'unread' | 'read' | 'handled';
  createdAt?: unknown;
}

export type MetalType = 'Gold' | 'Silver';

export type ProductCategory = 'MMTC PAMP' | 'Idols' | 'Bullions';

export type TransactionType = 'purchase' | 'sale' | 'return' | 'transfer' | 'adjustment' | 'repair' | 'melt';

export interface Location {
  id: string;
  name: string;
  description?: string;
  createdAt?: unknown;
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  metal: MetalType;
  sku: string;
  stock: number;
  stockByLocation: Record<string, number>;
  weight: number; // in grams (mandatory)
  purity: string; // e.g. "999", "999.9"
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  productId: string;
  productName: string;
  category: ProductCategory;
  metal?: MetalType;
  quantity: number;
  price?: number; // per unit (for purchase, sale, return)
  locationId: string;
  locationName: string;
  toLocationId?: string; // for transfer
  toLocationName?: string; // for transfer
  customerName?: string; // for sale, return
  notes?: string;
  previousWeight?: number; // for repair
  newWeight?: number; // for repair
  weightChange?: number; // for repair (+/-)
  recoveredWeight?: number; // for melt (in grams)
  date: string; // YYYY-MM-DD
  createdAt?: unknown;
}

// ==========================================
// RBAC & Access Control Types
// ==========================================

export type PermissionAction = 'view' | 'add' | 'edit' | 'delete';

export interface UserPermissions {
  products: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  purchases: { view: boolean; add: boolean; delete: boolean };
  movements: {
    view: boolean;
    transfer: boolean;
    adjustment: boolean;
    repair: boolean;
    melt: boolean;
    delete: boolean;
  };
  sales: { view: boolean; add: boolean; delete: boolean };
  returns: { view: boolean; add: boolean; delete: boolean };
  inquiries: { view: boolean; edit: boolean; delete: boolean };
  locations: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  brands: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  team: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  portfolio: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  reports: { view: boolean; export: boolean };
  archive: { zeroBalance: boolean; uploadArchive: boolean };
  users: { view: boolean; add: boolean; edit: boolean; delete: boolean };
}

export type UserRole = 'super_admin' | 'store_manager' | 'sales_cashier' | 'vault_custodian' | 'custom';
export type UserStatus = 'active' | 'suspended';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  role: UserRole;
  status: UserStatus;
  assignedLocationId?: string;
  assignedLocationName?: string;
  permissions: UserPermissions;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  createdById?: string;
  createdByEmail?: string;
}

// ==========================================
// Audit Trail & Activity Log Types
// ==========================================

export type AuditActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'reverse'
  | 'transfer'
  | 'adjustment'
  | 'repair'
  | 'melt'
  | 'zero_balance'
  | 'status_change'
  | 'login';

export interface AuditFieldDiff {
  field: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: AuditActionType;
  entityType: 'product' | 'purchase' | 'sale' | 'return' | 'movement' | 'inquiry' | 'location' | 'user' | 'archive' | 'brand' | 'team';
  entityId: string;
  entityName?: string;
  locationId?: string;
  locationName?: string;
  description: string;
  diffs?: AuditFieldDiff[];
  timestamp: string; // ISO 8601
  metadata?: Record<string, unknown>;
}

