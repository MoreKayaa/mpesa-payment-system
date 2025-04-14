const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const serviceAccount = require('C:\Users\User\Desktop\Projects\MPESA Web-App\mpesa-payment-system\mpesa-payment-system\serviceAccountKey.json')
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'mpesa-payment-system.firebasestorage.app' 
  databaseURL: 'mpesa-payment-system.firebaseio.com'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

// M-PESA API configuration
const CONSUMER_KEY = functions.config().mpesa.consumer_key;
const CONSUMER_SECRET = functions.config().mpesa.consumer_secret;
const PASSKEY = functions.config().mpesa.passkey;
const AUTH_URL = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
const STK_PUSH_URL = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

// STK Push function
exports.stkPush = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).send({ error: 'Method Not Allowed' });
    return;
  }
  
  try {
    const { phoneNumber, amount, businessShortCode, accountReference } = req.body;
    
    if (!phoneNumber || !amount || !businessShortCode) {
      res.status(400).send({ error: 'Missing required parameters' });
      return;
    }
    
    // Get access token
    const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
    const tokenResponse = await axios.get(AUTH_URL, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    
    const accessToken = tokenResponse.data.access_token;
    
    // Generate timestamp and password
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const password = Buffer.from(`${businessShortCode}${PASSKEY}${timestamp}`).toString('base64');
    
    // Create callback URL (points to the callback function)
    const callbackUrl = `https://${process.env.GCLOUD_PROJECT}.web.app/api/mpesaCallback`;
    
    // Prepare STK push request
    const stkRequest = {
      'BusinessShortCode': businessShortCode,
      'Password': password,
      'Timestamp': timestamp,
      'TransactionType': 'CustomerPayBillOnline',
      'Amount': parseInt(amount),
      'PartyA': phoneNumber,
      'PartyB': businessShortCode,
      'PhoneNumber': phoneNumber,
      'CallBackURL': callbackUrl,
      'AccountReference': accountReference || 'Payment',
      'TransactionDesc': 'Payment for services'
    };
    
    // Send STK push request
    const stkResponse = await axios.post(STK_PUSH_URL, stkRequest, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Store transaction request in Firestore for tracking
    await admin.firestore().collection('transactions').add({
      checkoutRequestId: stkResponse.data.CheckoutRequestID,
      merchantRequestId: stkResponse.data.MerchantRequestID,
      phoneNumber,
      amount,
      businessShortCode,
      accountReference,
      status: 'pending',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Return response to client
    res.status(200).send({
      success: true,
      data: stkResponse.data
    });
    
  } catch (error) {
    console.error('Error processing STK push:', error);
    
    res.status(500).send({
      success: false,
      error: error.message,
      details: error.response ? error.response.data : null
    });
  }
});

// M-PESA Callback function
exports.mpesaCallback = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send({ error: 'Method Not Allowed' });
    return;
  }
  
  try {
    const callbackData = req.body;
    console.log('M-PESA Callback Data:', JSON.stringify(callbackData));
    
    const callbackBody = callbackData.Body.stkCallback;
    const resultCode = callbackBody.ResultCode;
    const merchantRequestId = callbackBody.MerchantRequestID;
    const checkoutRequestId = callbackBody.CheckoutRequestID;
    
    // Find the transaction in Firestore
    const transactionsRef = admin.firestore().collection('transactions');
    const querySnapshot = await transactionsRef
      .where('checkoutRequestId', '==', checkoutRequestId)
      .where('merchantRequestId', '==', merchantRequestId)
      .limit(1)
      .get();
    
    if (querySnapshot.empty) {
      console.error('Transaction not found for checkout request ID:', checkoutRequestId);
      res.status(200).send({ success: false, message: 'Transaction not found' });
      return;
    }
    
    const transactionDoc = querySnapshot.docs[0];
    
    if (resultCode === 0) {
      // Payment successful
      const callbackItems = callbackBody.CallbackMetadata.Item;
      
      const findItem = (name) => {
        const item = callbackItems.find(item => item.Name === name);
        return item ? item.Value : null;
      };
      
      const transactionDetails = {
        amount: findItem('Amount'),
        mpesaReceiptNumber: findItem('MpesaReceiptNumber'),
        transactionDate: findItem('TransactionDate'),
        phoneNumber: findItem('PhoneNumber')
      };
      
      // Update transaction in Firestore
      await transactionDoc.ref.update({
        status: 'completed',
        mpesaReceiptNumber: transactionDetails.mpesaReceiptNumber,
        transactionDate: transactionDetails.transactionDate,
        completedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Send notification or trigger webhook if needed
      // You can add code here to notify your automation platforms
      
      res.status(200).send({
        success: true,
        message: 'Payment processed successfully'
      });
    } else {
      // Payment failed
      await transactionDoc.ref.update({
        status: 'failed',
        resultCode: resultCode,
        resultDesc: callbackBody.ResultDesc,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.status(200).send({
        success: false,
        message: 'Payment processing failed',
        resultDesc: callbackBody.ResultDesc
      });
    }
    
  } catch (error) {
    console.error('Error processing M-PESA callback:', error);
    
    res.status(500).send({
      success: false,
      error: error.message
    });
  }
});