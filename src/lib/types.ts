export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string;
  standardSizes: string[];
  customSizes: string[];
  standardPurities: string[];
  customPurities: string[];
  weight: string;
  material?: string;
  imageFile: string;
  additionalImages?: string[];
  variantSkus?: Record<string, string>;
  variantWeights?: Record<string, string>;
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
