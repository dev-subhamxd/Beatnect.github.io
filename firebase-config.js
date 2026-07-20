// Reuse the EXACT SAME config object you already use on your login/signup page.
// (Same Firebase project — so favourites saved here show up everywhere in CorDex.)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "devpandaxd-default-rtdb.firebaseapp.com",
  databaseURL: "https://devpandaxd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "devpandaxd",
  storageBucket: "devpandaxd.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
