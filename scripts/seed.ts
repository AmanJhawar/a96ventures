import { doc, setDoc, getDocs, deleteDoc, collection } from 'firebase/firestore/lite';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../src/lib/firebase/config';

// Utility to generate search terms
export function generateSearchTerms(name: string, category: string, material?: string): string[] {
  const text = `${name} ${category} ${material || ''}`.toLowerCase();
  const words = text.split(/[^a-z0-9]+/).filter(w => w.length > 1);
  return Array.from(new Set(words));
}

const catalogItems = [
  {
    id: "silver-ganesha",
    name: "Pure Silver Ganesha Idol",
    category: 'Silver Articles',
    description: "Intricately crafted Lord Ganesha idol made from 999 pure silver, perfect for gifting and pooja.",
    hasVariants: true,
    standardSizes: ["10cm", "15cm", "20cm"],
    standardPurities: ["99.9"],
    imageFile: "silver-ganesha.png",
    sku: "SG-001",
    slug: "pure-silver-ganesha-idol",
    weight: "",
    variantSkus: {
      "10cm | 99.9": "SG-001-10",
      "15cm | 99.9": "SG-001-15",
      "20cm | 99.9": "SG-001-20"
    },
    variantWeights: {
      "10cm | 99.9": "150",
      "15cm | 99.9": "300",
      "20cm | 99.9": "500"
    }
  },
  {
    id: "silver-elephant",
    name: "Silver Elephant Figurine",
    category: 'Silver Articles',
    description: "Detailed pure silver elephant showpiece symbolizing strength, wisdom, and good luck.",
    hasVariants: true,
    standardSizes: ["4cm", "7cm", "10cm"],
    standardPurities: ["92.5"],
    imageFile: "silver-elephant.png",
    sku: "SE-001",
    slug: "silver-elephant-figurine",
    weight: "",
    variantSkus: {
      "4cm | 92.5": "SE-001-4",
      "7cm | 92.5": "SE-001-7",
      "10cm | 92.5": "SE-001-10"
    },
    variantWeights: {
      "4cm | 92.5": "50",
      "7cm | 92.5": "100",
      "10cm | 92.5": "200"
    }
  },
  {
    id: "marble-photoframe",
    name: "Semi-Precious Marble Photoframe",
    category: 'Marble Photoframes',
    description: "Handcrafted white marble photoframe inlaid with natural semi-precious stones.",
    hasVariants: true,
    standardSizes: ["White Quartz", "Rose Quartz", "Lapis Lazuli"],
    standardPurities: [],
    imageFile: "marble-photoframe.png",
    sku: "MP-001",
    slug: "semi-precious-marble-photoframe",
    weight: "",
    variantSkus: {
      "White Quartz": "MP-001-WQ",
      "Rose Quartz": "MP-001-RQ",
      "Lapis Lazuli": "MP-001-LL"
    },
    variantWeights: {
      "White Quartz": "600",
      "Rose Quartz": "600",
      "Lapis Lazuli": "600"
    }
  },
  {
    id: "gold-coin",
    name: "24K Pure Gold Coin",
    category: 'Bullions',
    description: "MMTC-PAMP 24K 999.9 purity gold coin, ideal for investment and gifting.",
    hasVariants: true,
    standardSizes: ["10g", "20g", "50g"],
    standardPurities: [],
    imageFile: "gold-coin.png",
    sku: "GC-001",
    slug: "24k-pure-gold-coin",
    weight: "",
    variantSkus: {
      "10g": "GC-001-10",
      "20g": "GC-001-20",
      "50g": "GC-001-50"
    },
    variantWeights: {
      "10g": "10",
      "20g": "20",
      "50g": "50"
    }
  }
];

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

  // Wiping and seeding catalog
  console.log('Wiping existing catalog collection...');
  try {
    const querySnapshot = await getDocs(collection(db, 'catalog'));
    const deletePromises = querySnapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    console.log('Successfully wiped existing catalog.');
  } catch (e) {
    console.error('Failed to wipe catalog:', e);
  }

  console.log('Seeding catalog data to Firestore...');
  for (const item of catalogItems) {
    try {
      const searchTerms = generateSearchTerms(item.name || '', item.category || '');
      const itemWithSearch = { ...item, searchTerms };
      await setDoc(doc(db, 'catalog', item.id), itemWithSearch);
      console.log(`Successfully seeded catalog item: ${item.id}`);
    } catch (e) {
      console.error(`Failed to seed catalog item ${item.id}:`, e);
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
