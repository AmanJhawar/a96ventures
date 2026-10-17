import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore/lite";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDmKFzBNpXXy_rNvRtdgKhv9wDGax2QEKI",
  authDomain: "a96ventures-979e6.firebaseapp.com",
  projectId: "a96ventures-979e6",
  storageBucket: "a96ventures-979e6.firebasestorage.app",
  messagingSenderId: "983097773812",
  appId: "1:983097773812:web:0755f4639a8008bace98a1"
};

// Initialize Firebase securely (avoiding double initialization in dev)
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
