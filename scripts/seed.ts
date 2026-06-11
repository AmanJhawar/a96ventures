import { doc, setDoc } from 'firebase/firestore';
import { db } from '../src/lib/firebase/config';

const catalogItems = [
  {
    id: "silver-ganesha",
    name: "Pure Silver Ganesha Idol",
    category: 'Silver Idols',
    description: "Intricately crafted Lord Ganesha idol made from 999 pure silver, perfect for gifting and pooja.",
    hasVariants: true,
    standardSizes: ["3 inch", "5 inch", "7 inch"],
    standardPurities: ["99.9"],
    imageFile: "silver-ganesha.png"
  },
  {
    id: "silver-elephant",
    name: "Silver Elephant Figurine",
    category: 'Silver Animals',
    description: "Detailed pure silver elephant showpiece symbolizing strength, wisdom, and good luck.",
    hasVariants: true,
    standardSizes: ["Small", "Medium", "Large"],
    standardPurities: ["99.9"],
    imageFile: "silver-elephant.png"
  },
  {
    id: "marble-photoframe",
    name: "Semi-Precious Marble Photoframe",
    category: 'Marble Photoframes',
    description: "Handcrafted white marble photoframe inlaid with natural semi-precious stones.",
    hasVariants: true,
    standardSizes: ["Rose Quartz", "Lapis Lazuli", "Malachite"],
    standardPurities: [],
    imageFile: "marble-frame.png"
  }
];

async function seed() {
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
}

seed();
