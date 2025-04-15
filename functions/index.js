// Update your functions/index.js file

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors")({ origin: true });
const base64 = require("base-64");
const moment = require("moment");

admin.initializeApp();
const db = admin.firestore();

// Environment config
const consumerKey =
  functions.config().mpesa.consumer_key || process.env.MPESA_CONSUMER_KEY;
const consumerSecret =
  functions.config().mpesa.consumer_secret || process.env.MPESA_CONSUMER_SECRET;
const passkey = functions.config().mpesa.passkey || process.env.MPESA_PASSKEY;
const shortcode =
  functions.config().mpesa.shortcode || process.env.MPESA_SHORTCODE;
const environment = functions.config().mpesa.environment || "sandbox";

// Base URLs
const baseUrl =
  environment === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

// Get M-PESA access token
exports.getAccessToken = functions.https.onCall(async (data, context) => {
  try {
    const url = `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`;
    const auth = `Basic ${base64.encode(`${consumerKey}:${consumerSecret}`)}`;

    const response = await axios.get(url, {
      headers: {
        Authorization: auth,
      },
    });

    return {
      accessToken: response.data.access_token,
      expiresIn: response.data.expires_in,
    };
  } catch (error) {
    console.error("Error getting access token:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to get access token",
    );
  }
});

// Initiate STK Push
exports.initiateSTKPush = functions.https.onCall(async (data, context) => {
  try {
    // Get business information from the database
    const businessQuery = await db
      .collection("businesses")
      .where("slug", "==", data.businessSlug)
      .limit(1)
      .get();

    if (businessQuery.empty) {
      throw new functions.https.HttpsError("not-found", "Business not found");
    }

    const businessDoc = businessQuery.docs[0];
    const business = businessDoc.data();
    const businessId = businessDoc.id;

    // Get the access token
    const tokenResponse = await axios.get(
      `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${base64.encode(`${consumerKey}:${consumerSecret}`)}`,
        },
      },
    );

    const accessToken = tokenResponse.data.access_token;

    // Format phone number (remove leading 0 if present)
    let phoneNumber = data.phoneNumber;
    if (phoneNumber.startsWith("0")) {
      phoneNumber = `254${phoneNumber.substring(1)}`;
    }
    // If it doesn't start with 254, add it
    if (!phoneNumber.startsWith("254")) {
      phoneNumber = `254${phoneNumber}`;
    }

    // Format timestamp
    const timestamp = moment().format("YYYYMMDDHHmmss");

    // Business shortcode or use the global one
    const businessShortcode = business.mpesaConfig?.shortCode || shortcode;

    // Create password (shortcode + passkey + timestamp)
    const password = base64.encode(
      `${businessShortcode}${passkey}${timestamp}`,
    );

    // Prepare STK Push request
    const stkPushUrl = `${baseUrl}/mpesa/stkpush/v1/processrequest`;
    const stkRequestBody = {
      BusinessShortCode: businessShortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType:
        business.mpesaConfig?.transactionType || "CustomerPayBillOnline",
      Amount: data.amount,
      PartyA: phoneNumber,
      PartyB: businessShortcode,
      PhoneNumber: phoneNumber,
      CallBackURL:
        business.mpesaConfig?.callbackUrl ||
        `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/mpesaCallback/${data.businessSlug}`,
      AccountReference: business.mpesaConfig?.accountReference || business.name,
      TransactionDesc: `Payment for ${data.serviceName || "service"}`,
    };

    // Make the STK Push request
    const stkPushResponse = await axios.post(stkPushUrl, stkRequestBody, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    // Create a transaction record in Firestore
    const transactionData = {
      businessId: businessId,
      customerPhone: phoneNumber,
      serviceId: data.serviceId,
      serviceName: data.serviceName,
      amount: data.amount,
      status: "pending",
      mpesaDetails: {
        merchantRequestId: stkPushResponse.data.MerchantRequestID,
        checkoutRequestId: stkPushResponse.data.CheckoutRequestID,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      paymentMethod: "mpesa",
      notes: data.notes || "",
    };

    const transactionRef = await db
      .collection("transactions")
      .add(transactionData);

    return {
      success: true,
      transactionId: transactionRef.id,
      merchantRequestId: stkPushResponse.data.MerchantRequestID,
      checkoutRequestId: stkPushResponse.data.CheckoutRequestID,
      responseDescription: stkPushResponse.data.ResponseDescription,
    };
  } catch (error) {
    console.error("Error initiating STK Push:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to initiate payment: " + error.message,
    );
  }
});

// Handle M-PESA callback
exports.mpesaCallback = functions.https.onRequest(async (req, res) => {
  try {
    const businessSlug = req.path.split("/")[1]; // Extract business slug from URL
    if (!businessSlug) {
      return res.status(400).send("Business slug is required");
    }

    // Find business by slug
    const businessQuery = await db
      .collection("businesses")
      .where("slug", "==", businessSlug)
      .limit(1)
      .get();

    if (businessQuery.empty) {
      return res.status(404).send("Business not found");
    }

    const businessDoc = businessQuery.docs[0];
    const businessId = businessDoc.id;

    const callbackData = req.body.Body.stkCallback;
    const resultCode = callbackData.ResultCode;
    const merchantRequestId = callbackData.MerchantRequestID;
    const checkoutRequestId = callbackData.CheckoutRequestID;

    // Find the transaction using merchantRequestId and checkoutRequestId
    const transactionsSnapshot = await db
      .collection("transactions")
      .where("mpesaDetails.merchantRequestId", "==", merchantRequestId)
      .where("mpesaDetails.checkoutRequestId", "==", checkoutRequestId)
      .limit(1)
      .get();

    if (transactionsSnapshot.empty) {
      console.error(
        "Transaction not found:",
        merchantRequestId,
        checkoutRequestId,
      );
      return res.status(404).send("Transaction not found");
    }

    const transactionDoc = transactionsSnapshot.docs[0];
    const transactionRef = transactionDoc.ref;

    // Update transaction status based on result code
    if (resultCode === 0) {
      // Payment successful
      const callbackMetadata = callbackData.CallbackMetadata.Item;

      // Extract metadata items
      const extractMetadataItem = (name) => {
        const item = callbackMetadata.find((item) => item.Name === name);
        return item ? item.Value : null;
      };

      const mpesaReceiptNumber = extractMetadataItem("MpesaReceiptNumber");
      const transactionDate = extractMetadataItem("TransactionDate");
      const phoneNumber = extractMetadataItem("PhoneNumber");
      const amount = extractMetadataItem("Amount");

      // Update transaction with payment details
      await transactionRef.update({
        status: "completed",
        "mpesaDetails.mpesaReceiptNumber": mpesaReceiptNumber,
        "mpesaDetails.transactionDate": transactionDate,
        "mpesaDetails.phoneNumber": phoneNumber,
        "mpesaDetails.amount": amount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Trigger webhooks for the business
      const webhooksSnapshot = await db
        .collection("webhooks")
        .where("businessId", "==", businessId)
        .where("events", "array-contains", "payment.completed")
        .where("status", "==", "active")
        .get();

      const webhookPromises = [];
      webhooksSnapshot.forEach((doc) => {
        const webhook = doc.data();
        const webhookPayload = {
          event: "payment.completed",
          transactionId: transactionDoc.id,
          businessId,
          receiptNumber: mpesaReceiptNumber,
          amount,
          phoneNumber,
          serviceName: transactionDoc.data().serviceName,
          timestamp: Date.now(),
        };

        webhookPromises.push(
          axios
            .post(webhook.url, webhookPayload, {
              headers: { "Content-Type": "application/json" },
            })
            .catch((error) => {
              console.error(`Error triggering webhook ${doc.id}:`, error);
            }),
        );
      });

      await Promise.all(webhookPromises);
    } else {
      // Payment failed
      await transactionRef.update({
        status: "failed",
        "mpesaDetails.resultCode": resultCode,
        "mpesaDetails.resultDesc": callbackData.ResultDesc,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Trigger webhooks for payment failure
      const webhooksSnapshot = await db
        .collection("webhooks")
        .where("businessId", "==", businessId)
        .where("events", "array-contains", "payment.failed")
        .where("status", "==", "active")
        .get();

      const webhookPromises = [];
      webhooksSnapshot.forEach((doc) => {
        const webhook = doc.data();
        const webhookPayload = {
          event: "payment.failed",
          transactionId: transactionDoc.id,
          businessId,
          resultCode,
          resultDesc: callbackData.ResultDesc,
          timestamp: Date.now(),
        };

        webhookPromises.push(
          axios
            .post(webhook.url, webhookPayload, {
              headers: { "Content-Type": "application/json" },
            })
            .catch((error) => {
              console.error(`Error triggering webhook ${doc.id}:`, error);
            }),
        );
      });

      await Promise.all(webhookPromises);
    }

    // Return success response to M-PESA
    return res.status(200).send("Success");
  } catch (error) {
    console.error("Error processing M-PESA callback:", error);
    return res.status(500).send("Internal Server Error");
  }
});

// Query transaction status
exports.queryTransactionStatus = functions.https.onCall(
  async (data, context) => {
    try {
      // Get access token
      const tokenResponse = await axios.get(
        `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            Authorization: `Basic ${base64.encode(`${consumerKey}:${consumerSecret}`)}`,
          },
        },
      );

      const accessToken = tokenResponse.data.access_token;

      // Query transaction status
      const url = `${baseUrl}/mpesa/stkpushquery/v1/query`;
      const timestamp = moment().format("YYYYMMDDHHmmss");
      const password = base64.encode(`${shortcode}${passkey}${timestamp}`);

      const requestBody = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: data.checkoutRequestId,
      };

      const response = await axios.post(url, requestBody, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      console.error("Error querying transaction status:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to query transaction status",
      );
    }
  },
);
