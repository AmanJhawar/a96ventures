export interface CatalogItem {
  id: string
  name: string
  description: string
  price: string
  imageFile: string
}

export const catalogItems: CatalogItem[] = [
  {
    id: "item-1",
    name: "Diamond Solitaire Ring",
    description: "Classic 1-carat diamond solitaire ring in 18k white gold.",
    price: "$2,500",
    imageFile: "placeholder-ring.png"
  },
  {
    id: "item-2",
    name: "Sapphire Pendant",
    description: "Deep blue sapphire pendant with diamond halo in platinum.",
    price: "$1,800",
    imageFile: "placeholder-pendant.png"
  },
  {
    id: "item-3",
    name: "Tennis Bracelet",
    description: "Elegant tennis bracelet featuring round brilliant diamonds.",
    price: "$4,200",
    imageFile: "placeholder-bracelet.png"
  }
];
