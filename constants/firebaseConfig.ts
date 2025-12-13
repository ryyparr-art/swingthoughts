// constants/firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBgnus2kERSsimt21ynAbGxAU0sUGrfodM",
  authDomain: "swing-thoughts-1807b.firebaseapp.com",
  projectId: "swing-thoughts-1807b",
  storageBucket: "swing-thoughts-1807b.firebasestorage.app",
  messagingSenderId: "163594563736",
  appId: "1:163594563736:web:c60fa8fe7b59dacc99e0ed",
  measurementId: "G-PYXW1L8LGQ",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

