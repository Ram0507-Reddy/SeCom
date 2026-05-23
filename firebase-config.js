// SeCom Firebase Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const firebaseConfig = {
    projectId: "secom-secure-chat-2026",
    appId: "1:461770621076:web:4bdfcd3ea1c0a24d657481",
    storageBucket: "secom-secure-chat-2026.firebasestorage.app",
    apiKey: "AIzaSyArKYeDB_Pp-F-G9CvD4OntOm0q55ZvilM",
    authDomain: "secom-chat-2026.firebaseapp.com",
    messagingSenderId: "461770621076"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
