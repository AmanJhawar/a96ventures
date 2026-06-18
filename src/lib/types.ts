// A single configured variant, identified by its own SKU.
// The attributes describe which selection this SKU corresponds to.
export interface VariantDetail {
  size?: string;
  purity?: string;
  stone?: string;
  weight?: string;
}

export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string;
  standardSizes?: string[];
  customSizes?: string[];
  standardPurities?: string[];
  customPurities?: string[];
  standardWeights?: string[];
  customWeights?: string[];
  standardStones?: string[];
  customStones?: string[];
  // Per-variant SKUs, keyed by the variant's SKU. Each entry records the
  // size/purity/stone/weight that SKU represents, so the storefront can
  // resolve a customer's selection to the correct SKU and weight.
  variantSkus?: Record<string, VariantDetail>;
  weight: string;
  material?: string;
  imageFile: string;
  additionalImages?: string[];
  orderIndex?: number;
}

export const DEFAULT_CATEGORIES = ['Silver Articles', 'Marble Photoframes', 'Bullions'];

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
