import { doc, setDoc, getDocs, deleteDoc, collection } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../src/lib/firebase/config';

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
    standardSizes: ["Small", "Medium", "Large"],
    standardPurities: ["99.9"],
    imageFile: "silver-elephant.png",
    sku: "SE-001",
    slug: "silver-elephant-figurine",
    weight: "",
    variantSkus: {
      "Small | 99.9": "SE-001-S",
      "Medium | 99.9": "SE-001-M",
      "Large | 99.9": "SE-001-L"
    },
    variantWeights: {
      "Small | 99.9": "50",
      "Medium | 99.9": "100",
      "Large | 99.9": "200"
    }
  },
  {
    id: "marble-photoframe",
    name: "Semi-Precious Marble Photoframe",
    category: 'Marble Photoframes',
    description: "Handcrafted white marble photoframe inlaid with natural semi-precious stones.",
    hasVariants: true,
    standardSizes: ["Rose Quartz", "Lapis Lazuli", "Malachite"],
    standardPurities: ["Standard"],
    imageFile: "marble-photoframe.png",
    sku: "MP-001",
    slug: "semi-precious-marble-photoframe",
    weight: "",
    variantSkus: {
      "Rose Quartz | Standard": "MP-001-RQ",
      "Lapis Lazuli | Standard": "MP-001-LL",
      "Malachite | Standard": "MP-001-ML"
    },
    variantWeights: {
      "Rose Quartz | Standard": "600",
      "Lapis Lazuli | Standard": "600",
      "Malachite | Standard": "600"
    }
  },
  {
    id: "gold-coin",
    name: "24K Pure Gold Coin",
    category: 'Bullions',
    description: "MMTC-PAMP 24K 999.9 purity gold coin, ideal for investment and gifting.",
    hasVariants: true,
    standardSizes: ["10g", "20g", "50g"],
    standardPurities: ["999.9"],
    imageFile: "gold-coin.png",
    sku: "GC-001",
    slug: "24k-pure-gold-coin",
    weight: "",
    variantSkus: {
      "10g | 999.9": "GC-001-10",
      "20g | 999.9": "GC-001-20",
      "50g | 999.9": "GC-001-50"
    },
    variantWeights: {
      "10g | 999.9": "10",
      "20g | 999.9": "20",
      "50g | 999.9": "50"
    }
  }
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

  console.log('Wiping existing catalog collection...');
  try {
    const querySnapshot = await getDocs(collection(db, 'catalog'));
    const deletePromises = querySnapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    console.log('Successfully wiped existing catalog.');
  } catch (e) {
    console.error('Failed to wipe catalog:', e);
  }

  console.log('Seeding data to Firestore...');
  for (const item of catalogItems) {
    try {
      await setDoc(doc(db, 'catalog', item.id), item);
      console.log(`Successfully seeded: ${item.id}`);
    } catch (e) {
      console.error(`Failed to seed ${item.id}:`, e);
    }
  }
  console.log('Seeding complete.');
  process.exit(0);
}

seed();
