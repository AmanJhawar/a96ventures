import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore/lite";
import { getAuth } from "firebase/auth";
import { initializeAppCheck, ReCaptchaV3Provider, AppCheck } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyDmKFzBNpXXy_rNvRtdgKhv9wDGax2QEKI",
  authDomain: "a96ventures-979e6.firebaseapp.com",
  projectId: "a96ventures-979e6",
  storageBucket: "a96ventures-979e6.firebasestorage.app",
  messagingSenderId: "983097773812",
  appId: "1:983097773812:web:0755f4639a8008bace98a1"
};

// Initialize Firebase securely (avoiding double initialization in dev)
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Initialize Firebase App Check for browser clients
let appCheck: AppCheck | null = null;

if (typeof window !== "undefined") {
  try {
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    if (process.env.NODE_ENV !== "production") {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN || true;
    }

    if (siteKey) {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true
      });
    } else if (process.env.NODE_ENV !== "production") {
      // In development / testing, initialize with debug provider so App Check is active
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider("6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"),
        isTokenAutoRefreshEnabled: true
      });
    }
  } catch (err) {
    console.warn("Firebase App Check initialization warning:", err);
  }
}

export { appCheck };

