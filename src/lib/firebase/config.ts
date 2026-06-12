import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore/lite";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC9u17jg46lvVUsZwjgbDzqe_Ot6ZkXB-w",
  authDomain: "a96ventures-882ec.firebaseapp.com",
  projectId: "a96ventures-882ec",
  storageBucket: "a96ventures-882ec.firebasestorage.app",
  messagingSenderId: "579157315760",
  appId: "1:579157315760:web:56a93fc80c4372c51bab75",
  measurementId: "G-E2VBCYP5YX"
};

// Initialize Firebase securely (avoiding double initialization in dev)
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
