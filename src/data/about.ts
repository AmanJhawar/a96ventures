export interface Value {
  title: string
  description: string
}

export interface Milestone {
  year: string
  event: string
}

export const values: Value[] = [
  {
    title: "Founder-First",
    description: "We believe exceptional founders are the key to building transformative companies. Our approach centers on supporting visionary leaders.",
  },
  {
    title: "Long-term Partnership",
    description: "We build lasting relationships with our portfolio companies, providing ongoing support throughout their growth journey.",
  },
  {
    title: "Operational Excellence",
    description: "Our team brings deep operational experience to help startups scale efficiently and avoid common pitfalls.",
  },
  {
    title: "Global Perspective",
    description: "We invest in companies that can scale globally, leveraging our international network and market insights.",
  },
];

export const milestones: Milestone[] = [
  {
    year: "2023",
    event: "Aethereal Radiance Private Limited founded with ₹1M initial fund",
  },
  { year: "2025", event: "Seed funded MileMax Commerce LLP" },
  { year: "2025", event: "Changed the name to A96 Ventures Private Limited" },
  { year: "2025", event: "Seed funded Sacred Elements LLP" },
];
