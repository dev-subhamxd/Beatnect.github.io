// Reuse the EXACT SAME config object you already use on your login/signup page.
// (Same Firebase project — so favourites saved here show up everywhere in CorDex.)
const firebaseConfig = {
  apiKey: "AIzaSyDeTSmE9dVlmyU1vgFjw6fDF4bvk6ssUUY",
  authDomain: "devpandaxd-default-rtdb.firebaseapp.com",
  databaseURL: "https://devpandaxd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "devpandaxd",
  storageBucket: "devpandaxd.appspot.com",
  messagingSenderId: "947689099132",
  appId: "1:947689099132:web:495aaf1c69f75a11f2def9"
};

firebase.initializeApp(firebaseConfig);
