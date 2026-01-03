// constants/firebaseConfig.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Analytics, getAnalytics, isSupported } from "firebase/analytics";
import { getApp, getApps, initializeApp } from "firebase/app";
import { Auth, browserLocalPersistence, initializeAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";
import { FirebaseStorage, getStorage } from "firebase/storage";
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyBgnus2kERSsimt21ynAbGxAU0sUGrfodM",
  authDomain: "swing-thoughts-1807b.firebaseapp.com",
  projectId: "swing-thoughts-1807b",
  storageBucket: "swing-thoughts-1807b.firebasestorage.app",
  messagingSenderId: "163594563736",
  appId: "1:163594563736:web:c60fa8fe7b59dacc99e0ed",
  measurementId: "G-PYXW1L8LGQ"
};

// Prevent re-init during Fast Refresh
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Auth with platform-specific persistence
let auth: Auth;

if (Platform.OS === 'web') {
  auth = initializeAuth(app, {
    persistence: browserLocalPersistence
  });
} else {
  // For React Native, use AsyncStorage via dynamic import
  const getReactNativePersistence = require('firebase/auth/react-native').getReactNativePersistence;
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
}

const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

// Initialize Analytics (web only)
let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

export { analytics, auth, db, storage };

