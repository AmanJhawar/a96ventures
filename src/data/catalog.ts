export interface CatalogItem {
  id: string
  name: string
  category: 'Silver Idols' | 'Silver Animals' | 'Marble Photoframes'
  description: string
  variants: string[] // e.g., ["3 inch", "5 inch", "9 inch"] or ["Rose Quartz", "Amethyst"]
  imageFile: string
}

export const catalogItems: CatalogItem[] = [
  {
    id: "silver-ganesha",
    name: "Pure Silver Ganesha Idol",
    category: 'Silver Idols',
    description: "Intricately crafted Lord Ganesha idol made from 999 pure silver, perfect for gifting and pooja.",
    variants: ["3 inch", "5 inch", "7 inch"],
    imageFile: "silver-ganesha.png"
  },
  {
    id: "silver-elephant",
    name: "Silver Elephant Figurine",
    category: 'Silver Animals',
    description: "Detailed pure silver elephant showpiece symbolizing strength, wisdom, and good luck.",
    variants: ["Small", "Medium", "Large"],
    imageFile: "silver-elephant.png"
  },
  {
    id: "marble-photoframe",
    name: "Semi-Precious Marble Photoframe",
    category: 'Marble Photoframes',
    description: "Handcrafted white marble photoframe inlaid with natural semi-precious stones.",
    variants: ["Rose Quartz", "Lapis Lazuli", "Malachite"],
    imageFile: "marble-frame.png"
  }
];
