// Add this to a new file: public/js/database-setup.js

import { db } from "./firebase-config.js";
import firebase from "firebase/app";

// Create initial collections and documents
const setupDatabase = async () => {
  try {
    // Settings collection - Global settings
    await db
      .collection("settings")
      .doc("global")
      .set({
        adminEmails: ["your-admin-email@example.com"],
        defaultCurrency: "KES",
        supportContact: "+254XXXXXXXXX",
        platformFee: 2.5,
      });

    // Create a test business
    const businessRef = await db.collection("businesses").add({
      name: "Trimax Fitness Centre",
      slug: "trimaxfitnesscentre",
      contactEmail: "contact@trimaxfitness.com",
      contactPhone: "+254712345678",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: "active",
      mpesaConfig: {
        shortCode: "123456",
        callbackUrl: `https://us-central1-${process.env.FIREBASE_PROJECT_ID}.cloudfunctions.net/mpesaCallback/trimaxfitnesscentre`,
        accountReference: "TrimaxRef",
        transactionType: "CustomerPayBillOnline",
      },
      branding: {
        primaryColor: "#FF5733",
        secondaryColor: "#33FF57",
        fontFamily: "Arial, sans-serif",
      },
      services: [
        {
          id: "service1",
          name: "Fitness Subscription",
          description: "Monthly fitness subscription",
          amount: 5000,
        },
      ],
    });

    console.log("Database setup completed!");
    return true;
  } catch (error) {
    console.error("Database setup failed:", error);
    return false;
  }
};

// Export for use in admin dashboard
export { setupDatabase };
