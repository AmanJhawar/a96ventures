export interface TeamMember {
  name: string
  role: string
  bio: string
  expertise: string[]
  imageFile?: string
  linkedin?: string
}

export const teamMembers: TeamMember[] = [
  {
    name: "Aman Jhawar",
    role: "Managing Director",
    bio: "Has over 10+ years of experience in sales, alongside diverse expertise across creative and financial sectors.",
    expertise: ["Luxury & Jewelry Design", "Financial Markets", "Narrative & Storytelling", "Sales Strategy"],
  },
];
