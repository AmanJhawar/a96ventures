import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC9u17jg46lvVUsZwjgbDzqe_Ot6ZkXB-w",
  authDomain: "a96ventures-882ec.firebaseapp.com",
  projectId: "a96ventures-882ec",
  storageBucket: "a96ventures-882ec.firebasestorage.app",
  messagingSenderId: "579157315760",
  appId: "1:579157315760:web:56a93fc80c4372c51bab75",
  measurementId: "G-E2VBCYP5YX"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
  console.log('Seeding Portfolio...');
  for (const p of portfolioCompanies) {
    await setDoc(doc(db, 'portfolio', p.slug), p);
  }
  
  console.log('Seeding Insights...');
  for (const i of insights) {
    // Generate simple ID based on title
    const id = i.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await setDoc(doc(db, 'insights', id), i);
  }
  
  console.log('Seeding complete.');
}

seed();
