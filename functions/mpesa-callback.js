const axios = require('axios');

// Webhook URL for your automation platform (e.g., Make.com)
const automationWebhook = process.env.AUTOMATION_WEBHOOK_URL;

exports.handler = async function(event, context) {
  // Only allow POST method
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }
  
  try {
    // Parse the callback data from M-PESA
    const callbackData = JSON.parse(event.body);
    
    // Log the callback data for debugging
    console.log('M-PESA Callback Data:', JSON.stringify(callbackData));
    
    // Extract the callback body
    const callbackBody = callbackData.Body.stkCallback;
    const resultCode = callbackBody.ResultCode;
    
    // Check if the transaction was successful
    if (resultCode === 0) {
      // Extract important details from the callback
      const callbackItems = callbackBody.CallbackMetadata.Item;
      
      // Function to find a specific item from the callback
      const findItem = (name) => {
        const item = callbackItems.find(item => item.Name === name);
        return item ? item.Value : null;
      };
      
      // Extract transaction details
      const transactionData = {
        amount: findItem('Amount'),
        mpesaReceiptNumber: findItem('MpesaReceiptNumber'),
        transactionDate: findItem('TransactionDate'),
        phoneNumber: findItem('PhoneNumber')
      };
      
      // Forward to automation platform
      if (automationWebhook) {
        await axios.post(automationWebhook, {
          success: true,
          ...transactionData
        });
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Payment processed successfully',
          data: transactionData
        })
      };
    } else {
      // Transaction failed
      if (automationWebhook) {
        await axios.post(automationWebhook, {
          success: false,
          resultCode: resultCode,
          resultDesc: callbackBody.ResultDesc
        });
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          message: 'Payment processing failed',
          resultCode: resultCode,
          resultDesc: callbackBody.ResultDesc
        })
      };
    }
    
  } catch (error) {
    console.error('Error processing M-PESA callback:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};