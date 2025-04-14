const firebaseConfig = {
    apiKey: "AIzaSyD1_OtYRfpV3Zq2tjbbcO1e2gE_xfZ-evE",
    authDomain: "mpesa-payment-system.firebaseapp.com",
    projectId: "mpesa-payment-system",
    storageBucket: "mpesa-payment-system.firebasestorage.app",
    messagingSenderId: "823202358398",
    appId: "1:823202358398:web:0416bd58ed8ebcd8b2642f",
    measurementId: "YOUR_MEASUREMENT_ID" // If using Analytics
  };
  
  // Initialize Firebase
  const app = firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  const auth = firebase.auth();
  const storage = firebase.storage();
  
  export { app, db, auth, storage };
  