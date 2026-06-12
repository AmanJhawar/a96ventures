import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../src/lib/firebase/config';

const teamMembers = [
  {
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
    console.error('Error: NEXT_PUBLIC_SEED_EMAIL and NEXT_PUBLIC_SEED_PASSWORD must be set in .env.local');
    process.exit(1);
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log('Authenticated successfully.');
  } catch (err) {
    console.error('Authentication failed:', err);
    process.exit(1);
  }

  console.log('Seeding Team...');
  for (const t of teamMembers) {
    await addDoc(collection(db, 'team'), t);
  }
  
  console.log('Seeding Brands...');
  for (const b of brands) {
    await setDoc(doc(db, 'brands', b.id), b);
  }

  console.log('Seeding Portfolio...');
  for (const p of portfolioCompanies) {
    await setDoc(doc(db, 'portfolio', p.slug), p);
  }
  
  console.log('Seeding Insights...');
  for (const i of insights) {
    const id = i.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await setDoc(doc(db, 'insights', id), i);
  }
  
  console.log('Seeding complete.');
}

seed();
