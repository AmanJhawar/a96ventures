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

export type ProductCategory = 'MMTC PAMP' | 'Silver Idols' | 'Bullions';

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
  sku: string;
  stock: number;
  stockByLocation: Record<string, number>;
  weight: number; // in grams
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
