export interface CatalogItem {
  id: string
  slug: string
  sku: string
  name: string
  category: string
  description: string
  hasVariants: boolean
  standardSizes: string[]   // e.g., ["4cm", "7cm", "10cm"]
  customSizes: string[]     // e.g., ["15cm", "20cm"]
  standardPurities: string[] // e.g., ["92.5", "80.0"]
  customPurities: string[]   // e.g., ["99.9"]
  weight: string
  imageFile: string
  // computed helper for display
  variants: string[]
}

export const catalogItems: CatalogItem[] = [
  {
    id: "silver-ganesha",
    slug: "silver-ganesha",
    sku: "A96-001",
    name: "Pure Silver Ganesha Idol",
    category: 'Silver Idols',
    description: "Intricately crafted Lord Ganesha idol made from 999 pure silver, perfect for gifting and pooja.",
    hasVariants: true,
    standardSizes: ["4cm", "7cm", "10cm"],
    customSizes: [],
    standardPurities: ["92.5"],
    customPurities: [],
    weight: "50g",
    variants: ["4cm", "7cm", "10cm"],
    imageFile: "silver-ganesha.png"
  },
  {
    id: "silver-elephant",
    slug: "silver-elephant",
    sku: "A96-002",
    name: "Silver Elephant Figurine",
    category: 'Silver Animals',
    description: "Detailed pure silver elephant showpiece symbolizing strength, wisdom, and good luck.",
    hasVariants: true,
    standardSizes: ["4cm", "7cm"],
    customSizes: [],
    standardPurities: ["92.5", "80.0"],
    customPurities: [],
    weight: "75g",
    variants: ["4cm", "7cm"],
    imageFile: "silver-elephant.png"
  },
  {
    id: "marble-photoframe",
    slug: "marble-photoframe",
    sku: "A96-003",
    name: "Semi-Precious Marble Photoframe",
    category: 'Marble Photoframes',
    description: "Handcrafted white marble photoframe inlaid with natural semi-precious stones.",
    hasVariants: false,
    standardSizes: [],
    customSizes: [],
    standardPurities: [],
    customPurities: [],
    weight: "200g",
    variants: ["Rose Quartz", "Lapis Lazuli", "Malachite"],
    imageFile: "marble-frame.png"
  }
];

