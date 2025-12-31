import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDSm17e2FrsydH7hPiHUKNWLwXr6UNVPQQ",
  authDomain: "aurak-levelling.firebaseapp.com",
  projectId: "aurak-levelling",
  storageBucket: "aurak-levelling.appspot.com",
  messagingSenderId: "895550834916",
  appId: "1:895550834916:web:1cfd42e1719c9b6e56c4f1",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export const db = getFirestore(app);
