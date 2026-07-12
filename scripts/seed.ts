import { doc, setDoc, getDocs, deleteDoc, collection } from 'firebase/firestore/lite';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../src/lib/firebase/config';

// Utility to generate search terms
export function generateSearchTerms(name: string, category: string, material?: string): string[] {
  const text = `${name} ${category} ${material || ''}`.toLowerCase();
  const words = text.split(/[^a-z0-9]+/).filter(w => w.length > 1);
  return Array.from(new Set(words));
}

const teamMembers = [
  {
    id: "aman-jhawar",
    name: "Aman Jhawar",
    role: "Managing Director",
    bio: "Has over 10+ years of experience in sales, alongside diverse expertise across creative and financial sectors.",
    expertise: ["Luxury & Jewelry Design", "Financial Markets", "Narrative & Storytelling", "Sales Strategy"],
  },
];

const brands = [
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

const portfolioCompanies = [
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
];

const insights = [
  {
    title: "The Future of AI in Enterprise Software",
    date: "January 15, 2026",
    category: "Technology",
    excerpt: "How artificial intelligence is reshaping enterprise workflows and creating new opportunities for startups.",
    readTime: "5 min read",
  },
  {
    title: "Climate Tech Investment Trends for 2026",
    date: "January 10, 2026",
    category: "Climate Tech",
    excerpt: "Key trends and opportunities in climate technology investments as the world accelerates toward net-zero goals.",
    readTime: "7 min read",
  },
  {
    title: "Building Resilient Healthcare Startups",
    date: "January 5, 2026",
    category: "Healthcare",
    excerpt: "Lessons learned from successful healthcare investments and what makes medical startups thrive.",
    readTime: "6 min read",
  },
  {
    title: "The Quantum Computing Revolution",
    date: "December 28, 2025",
    category: "Deep Tech",
    excerpt: "Understanding the potential and timeline for quantum computing commercialization across industries.",
    readTime: "8 min read",
  },
  {
    title: "Cybersecurity in the Age of Remote Work",
    date: "December 20, 2025",
    category: "Cybersecurity",
    excerpt: "How the shift to remote work has created new cybersecurity challenges and investment opportunities.",
    readTime: "4 min read",
  },
  {
    title: "ESG Investing: Beyond the Buzzword",
    date: "December 15, 2025",
    category: "ESG",
    excerpt: "A practical approach to environmental, social, and governance considerations in venture capital.",
    readTime: "6 min read",
  },
];

async function seed() {
  console.log('Authenticating...');
  const email = process.env.NEXT_PUBLIC_SEED_EMAIL;
  const password = process.env.NEXT_PUBLIC_SEED_PASSWORD;

  if (!email || !password) {
    console.warn('Warning: NEXT_PUBLIC_SEED_EMAIL or PASSWORD not found. Continuing without authentication (will only work if Firestore rules allow public writes).');
  } else {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log('Authenticated successfully.');
    } catch (err) {
      console.warn('Authentication failed. Continuing without authentication (will only work if Firestore rules allow public writes).');
    }
  }

  // Wiping and seeding team
  console.log('Wiping existing team collection...');
  try {
    const querySnapshot = await getDocs(collection(db, 'team'));
    const deletePromises = querySnapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    console.log('Successfully wiped existing team.');
  } catch (e) {
    console.error('Failed to wipe team:', e);
  }

  console.log('Seeding Team to Firestore...');
  for (const t of teamMembers) {
    try {
      const { id, ...teamData } = t;
      await setDoc(doc(db, 'team', id), teamData);
      console.log(`Successfully seeded team member: ${id}`);
    } catch (e) {
      console.error(`Failed to seed team member ${t.name}:`, e);
    }
  }

  // Seeding Brands
  console.log('Seeding Brands to Firestore...');
  for (const b of brands) {
    try {
      await setDoc(doc(db, 'brands', b.id), b);
      console.log(`Successfully seeded brand: ${b.id}`);
    } catch (e) {
      console.error(`Failed to seed brand ${b.name}:`, e);
    }
  }

  // Seeding Portfolio
  console.log('Seeding Portfolio to Firestore...');
  for (const p of portfolioCompanies) {
    try {
      await setDoc(doc(db, 'portfolio', p.slug), p);
      console.log(`Successfully seeded portfolio company: ${p.slug}`);
    } catch (e) {
      console.error(`Failed to seed portfolio company ${p.name}:`, e);
    }
  }

  // Seeding Insights
  console.log('Seeding Insights to Firestore...');
  for (const i of insights) {
    try {
      const id = i.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await setDoc(doc(db, 'insights', id), i);
      console.log(`Successfully seeded insight: ${id}`);
    } catch (e) {
      console.error(`Failed to seed insight ${i.title}:`, e);
    }
  }

  console.log('Seeding complete.');
  process.exit(0);
}

seed();
