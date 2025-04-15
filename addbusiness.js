const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // download this from Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function addBusiness(businessId) {
  const businessRef = db.collection("businesses").doc(businessId);

  await businessRef.set({
    name: "Business Name",
    slug: "business-name",
    contactEmail: "business@example.com",
    contactPhone: "+254712345678",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "active",
    mpesaConfig: {
      shortCode: "123456",
      callbackUrl:
        "https://us-central1-your-project.cloudfunctions.net/mpesaCallback/business-name",
      accountReference: "BusinessRef",
      transactionType: "CustomerPayBillOnline",
    },
    branding: {
      primaryColor: "#FF5733",
      secondaryColor: "#33FF57",
      fontFamily: "Arial, sans-serif",
      logoUrl:
        "https://storage.googleapis.com/your-project.appspot.com/businesses/business-id/logo.png",
      bannerUrl:
        "https://storage.googleapis.com/your-project.appspot.com/businesses/business-id/banner.jpg",
    },
    services: [
      {
        id: "service1",
        name: "Standard Service",
        description: "Basic service description",
        amount: 1000,
      },
      {
        id: "service2",
        name: "Premium Service",
        description: "Premium service with additional features",
        amount: 2500,
      },
    ],
    owner: "userId",
  });

  console.log("✅ Business added successfully!");
}

addBusiness("demo-business-id");
