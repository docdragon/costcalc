// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, 
    deleteDoc, serverTimestamp, getDocs, query, limit, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut,
    setPersistence, browserSessionPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- Cấu hình Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyC_8Q8Girww42mI-8uwYsJaH5Vi41FT1eA",
    authDomain: "tinh-gia-thanh-app-fbdc0.firebaseapp.com",
    projectId: "tinh-gia-thanh-app-fbdc0",
    storageBucket: "tinh-gia-thanh-app-fbdc0.firebasestorage.app",
    messagingSenderId: "306099623121",
    appId: "1:306099623121:web:157ce5827105998f3a61f0",
    measurementId: "G-D8EHTN2SWE"
};

// --- Khởi tạo và Xuất ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Xuất các dịch vụ và hàm của Firebase để sử dụng trong các module khác
export {
    db,
    auth,
    collection,
    onSnapshot,
    addDoc,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    getDocs,
    query,
    limit,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    setDoc,
    getDoc,
    setPersistence,
    browserSessionPersistence,
    browserLocalPersistence
};