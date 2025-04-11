const axios = require('axios');

// Environment variables (set in Netlify dashboard)
const consumerKey = process.env.MPESA_CONSUMER_KEY;
const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
const passkey = process.env.MPESA_PASSKEY;
const callbackUrl = process.env.MPESA_CALLBACK_URL;

// Base URLs
const authUrl = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
const stkPushUrl = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

// Handler function
exports.handler = async function(event, context) {
  // Only allow POST method
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }
  
  try {
    // Parse the request body
    const data = JSON.parse(event.body);
    const { phoneNumber, amount, businessShortCode, accountReference } = data;
    
    if (!phoneNumber || !amount || !businessShortCode) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required parameters' })
      };
    }
    
    // Generate the access token
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const tokenResponse = await axios.get(authUrl, {
      headers: {
        "Authorization": `Basic ${auth}`
      }
    });
    
    const accessToken = tokenResponse.data.access_token;
    
    // Generate timestamp
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    
    // Generate password
    const password = Buffer.from(`${businessShortCode}${passkey}${timestamp}`).toString('base64');
    
    // Prepare STK push request
    const stkPushRequest = {
      "BusinessShortCode": businessShortCode,
      "Password": password,
      "Timestamp": timestamp,
      "TransactionType": "CustomerPayBillOnline",
      "Amount": parseInt(amount),
      "PartyA": phoneNumber,
      "PartyB": businessShortCode,
      "PhoneNumber": phoneNumber,
      "CallBackURL": callbackUrl,
      "AccountReference": accountReference || "Payment",
      "TransactionDesc": "Payment for services"
    };
    
    // Make the STK push request
    const stkResponse = await axios.post(stkPushUrl, stkPushRequest, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });
    
    // Return the response
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: stkResponse.data
      })
    };
    
  } catch (error) {
    console.error('Error processing STK push:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        details: error.response ? error.response.data : null
      })
    };
  }
};