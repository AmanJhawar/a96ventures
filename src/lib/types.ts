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
  customerId?: string;
  customerDisplayName?: string;
  createdAt?: unknown;
}

export type MetalType = 'Gold' | 'Silver';

export type ProductCategory = 'Bullions' | 'Idols' | 'MMTC PAMP';

export type ProductBrand = 'MMTC PAMP' | 'Local';

export type TransactionType = 'purchase' | 'sale' | 'return' | 'transfer' | 'adjustment' | 'repair' | 'melt' | 'reversal' | 'opening';

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
  brand?: string;
  metal: MetalType;
  sku: string;
  stock: number;
  stockByLocation: Record<string, number>;
  weight: number; // in grams (display / API)
  weightMg?: number; // storage in integer milligrams (1g = 1000mg)
  pieceWeights?: number[]; // For Idols: individual piece weights in stock in grams (3 decimals)
  pieceWeightsMg?: number[]; // For Idols: individual piece weights in integer milligrams
  pieceWeightsByLocation?: Record<string, number[]>; // For Idols: piece weights per location in grams
  pieceWeightsByLocationMg?: Record<string, number[]>; // For Idols: piece weights per location in integer milligrams
  purity: string; // e.g. "999", "999.9"
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  archivedByEmail?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  productId: string;
  productName: string;
  category: ProductCategory;
  brand?: string;
  metal?: MetalType;
  quantity: number;
  price?: number; // per unit (for purchase, sale, return)
  totalAmount?: number; // total value (price * quantity)
  locationId: string;
  locationName: string;
  toLocationId?: string; // for transfer
  toLocationName?: string; // for transfer
  customerName?: string; // for sale, return
  customerId?: string; // CRM customer ID
  orderId?: string; // CRM order ID
  vendorName?: string; // for purchase
  notes?: string;
  weight?: number; // total weight (in grams)
  weightMg?: number; // total weight (in whole milligrams)
  previousWeight?: number; // for repair (in grams)
  previousWeightMg?: number; // for repair (in whole milligrams)
  newWeight?: number; // for repair (in grams)
  newWeightMg?: number; // for repair (in whole milligrams)
  weightChange?: number; // for repair delta (+/- in grams)
  weightChangeMg?: number; // for repair delta (+/- in whole milligrams)
  recoveredWeight?: number; // for melt (in grams)
  recoveredWeightMg?: number; // for melt (in whole milligrams)
  pieceWeights?: number[]; // For idol purchases/adjustments: individual piece weights added (in grams)
  pieceWeightsMg?: number[]; // For idol purchases/adjustments: individual piece weights added (in milligrams)
  pieceWeight?: number; // For idol sale/transfer/melt/repair: specific piece weight involved (in grams)
  pieceWeightMg?: number; // For idol sale/transfer/melt/repair: specific piece weight involved (in milligrams)
  date: string; // YYYY-MM-DD
  createdAt?: unknown;
  isReversed?: boolean;
  reversedAt?: string;
  reversedBy?: string;
  reversedByEmail?: string;
  reversalTransactionId?: string;
  isReversal?: boolean;
  reversalOf?: string; // Points to the original transaction ID this reverses
  isOpeningBalance?: boolean;
  isOpeningEntry?: boolean;
}

export interface TransactionStats {
  salesCount: number;
  salesUnits: number;
  salesRevenue: number;
  returnsCount: number;
  returnsUnits: number;
  returnsAmount: number;
  netRevenue: number;
  profit: number;
  costOfGoodsSold?: number;
  productSalesStats?: Record<string, { unitsSold: number; totalRevenue: number; salesCount: number; profit?: number; cost?: number }>;
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
  customers: {
    view: boolean;
    add: boolean;
    edit: boolean;
    delete: boolean;
    export: boolean;
    viewPan: boolean;
    editPan: boolean;
  };
  visits: {
    view: boolean;
    add: boolean;
    edit: boolean;
    delete: boolean;
  };
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
  entityType: 'product' | 'purchase' | 'sale' | 'return' | 'movement' | 'inquiry' | 'location' | 'user' | 'archive' | 'brand' | 'team' | 'portfolio' | 'customer' | 'visit' | 'order';
  entityId: string;
  entityName?: string;
  locationId?: string;
  locationName?: string;
  description: string;
  diffs?: AuditFieldDiff[];
  timestamp: string; // ISO 8601
  metadata?: Record<string, unknown>;
}

// ==========================================
// Customer CRM, Orders & Visits Types
// ==========================================

export interface CustomerAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country: 'India';
}

export interface CustomerPanSummary {
  masked: string; // e.g. "•••••1234F"
  last4: string;
  holderType: string; // 4th character of PAN (P, C, F, H, etc.)
}

export interface CustomerStats {
  firstVisitAt?: string;
  lastVisitAt?: string;
  visitCount: number;
  orderCount: number;
  lifetimeValuePaise: number;
  lifetimeWeightMg: {
    Gold: number;
    Silver: number;
  };
  lastOrderId?: string;
  openFollowUps: number;
}

export interface Customer {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  displayName: string;
  mobile: {
    countryCode: string;
    number: string;
    e164: string;
  };
  email?: string;
  address?: CustomerAddress;
  pan?: CustomerPanSummary;
  hasPan: boolean;
  notes?: string;
  source: 'walk_in' | 'inquiry' | 'referral' | 'import';
  inquiryIds: string[];
  stats: CustomerStats;
  searchTerms: string[];
  isArchived: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank' | 'old_metal';

export interface OrderPayment {
  mode: PaymentMode;
  amountPaise: number;
  reference?: string;
  metal?: 'Gold' | 'Silver';
  weightMg?: number;
  purity?: string;
}

export interface OrderLine {
  transactionId: string;
  productId: string;
  productName: string;
  metal: string;
  category: string;
  qty: number;
  pieceWeightMg?: number;
  unitPricePaise: number;
  lineTotalPaise: number;
}

export interface Order {
  id: string;
  orderNo: string; // e.g. "A96-2026-000123"
  type: 'sale' | 'return';
  customerId?: string;
  customerSnapshot?: {
    displayName: string;
    mobileE164: string;
  };
  locationId: string;
  locationName: string;
  date: string; // "YYYY-MM-DD"
  createdAt: string;
  createdBy: string;
  lines: OrderLine[];
  totals: {
    amountPaise: number;
    units: number;
    weightMg: {
      Gold: number;
      Silver: number;
    };
  };
  payments: OrderPayment[];
  notes?: string;
  isReversed: boolean;
  reversedAt?: string;
  reversedBy?: string;
  reversalOrderId?: string;
  reversalOf?: string;
}

export type VisitKind = 'purchase' | 'return' | 'walk_in' | 'inquiry' | 'follow_up' | 'repair';

export interface Visit {
  id: string;
  customerId: string;
  locationId: string;
  at: string;
  staffId: string;
  staffName: string;
  kind: VisitKind;
  orderId?: string;
  inquiryId?: string;
  note?: string;
  followUpOn?: string; // "YYYY-MM-DD"
  followUpDone: boolean;
  followUpOf?: string;
}

