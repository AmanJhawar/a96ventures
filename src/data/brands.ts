export interface Brand {
  id: number
  name: string
  description: string
  sector: string
  logoFile: string
}

export const brands: Brand[] = [
  {
    id: 1,
    name: "White and Yellow",
    description: "Finest Gold and Silver Bullions.",
    sector: "Bullions",
    logoFile: "white-and-yellow.png"
  },
  {
    id: 2,
    name: "IDOLIZE",
    description: "Handcrafted Silver Idols and Home Decor.",
    sector: "Home Decor",
    logoFile: "idolize.png"
  },
];
