import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

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

const catalogItems = [
  {
    id: "silver-ganesha",
    name: "Pure Silver Ganesha Idol",
    category: 'Silver Idols',
    description: "Intricately crafted Lord Ganesha idol made from 999 pure silver, perfect for gifting and pooja.",
    variants: ["3 inch", "5 inch", "7 inch"],
    imageFile: "silver-ganesha.png"
  },
  {
    id: "silver-elephant",
    name: "Silver Elephant Figurine",
    category: 'Silver Animals',
    description: "Detailed pure silver elephant showpiece symbolizing strength, wisdom, and good luck.",
    variants: ["Small", "Medium", "Large"],
    imageFile: "silver-elephant.png"
  },
  {
    id: "marble-photoframe",
    name: "Semi-Precious Marble Photoframe",
    category: 'Marble Photoframes',
    description: "Handcrafted white marble photoframe inlaid with natural semi-precious stones.",
    variants: ["Rose Quartz", "Lapis Lazuli", "Malachite"],
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
