import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBgnus2kERSsimt21ynAbGxAU0sUGrfodM",
  authDomain: "swing-thoughts-1807b.firebaseapp.com",
  projectId: "swing-thoughts-1807b",
  storageBucket: "swing-thoughts-1807b.firebasestorage.app",
  messagingSenderId: "163594563736",
  appId: "1:163594563736:web:c60fa8fe7b59dacc99e0ed",
  measurementId: "G-PYXW1L8LGQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with platform-specific persistence
let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
}

// Initialize Firestore and Storage
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };

