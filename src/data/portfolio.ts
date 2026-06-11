export interface PortfolioCompany {
  name: string
  slug: string
  description: string
  stage: string
  sector: string
}

export const portfolioCompanies: PortfolioCompany[] = [
  {
    name: "MileMax Commerce LLP",
    slug: "milemax",
    description: "Last-mile delivery and e-commerce logistics solutions focusing on efficiency and sustainable transport.",
    stage: "Seed",
    sector: "Logistics"
  },
  {
    name: "Sacred Elements LLP",
    slug: "sacred-elements",
    description: "Premium sustainable lifestyle and wellness products crafted from ethically sourced natural materials.",
    stage: "Seed",
    sector: "D2C/Wellness"
  }
]
