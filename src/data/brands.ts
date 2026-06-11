export interface Brand {
  id: string
  name: string
  description: string
  sector: string
  logoFile: string
}

export const brands: Brand[] = [
  {
    id: "white-and-yellow",
    name: "White and Yellow",
    description: "Finest Gold and Silver Bullions.",
    sector: "Bullions",
    logoFile: "white-and-yellow.png"
  },
  {
    id: "idolize",
    name: "IDOLIZE",
    description: "Handcrafted Silver Idols and Home Decor.",
    sector: "Home Decor",
    logoFile: "idolize.png"
  },
];
