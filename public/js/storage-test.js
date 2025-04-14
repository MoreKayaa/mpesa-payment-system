import { storage } from './firebase-config.js';

// Testing storage initialization
const testStorage = async () => {
  try {
    const storageRef = storage.ref();
    const testRef = storageRef.child('test-file.txt');
    
    // Create a small test file
    const testString = 'Storage test ' + new Date().toISOString();
    await testRef.putString(testString);
    
    console.log('Storage test successful!');
    return true;
  } catch (error) {
    console.error('Storage test failed:', error);
    return false;
  }
};

// Run the test when needed
window.testStorage = testStorage;