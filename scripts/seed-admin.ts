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
    id: 1,
    name: "White and Yellow",
    description: "Finest Gold and Silver Bullions.",
    sector: "Bullions",
    logoFile: "white-and-yellow.png"
  },
  {
    id: 2,
    name: "IDOLIZE",
    description: "Handcrafted Silver Idols and Home Decor.",
    sector: "Home Decor",
    logoFile: "idolize.png"
  },
];

async function seed() {
  console.log('Seeding Team...');
  for (const t of teamMembers) {
    await addDoc(collection(db, 'team'), t);
  }
  
  console.log('Seeding Brands...');
  for (const b of brands) {
    await setDoc(doc(db, 'brands', b.id.toString()), b);
  }
  
  console.log('Seeding complete.');
}

seed();
