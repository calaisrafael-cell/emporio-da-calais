import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDocs, addDoc, setDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBP6uOHQuwVYDhjz-XrKQwGcydfU4lPx2M",
  authDomain: "emporio-calais.firebaseapp.com",
  projectId: "emporio-calais",
  storageBucket: "emporio-calais.firebasestorage.app",
  messagingSenderId: "793932027055",
  appId: "1:793932027055:web:508de6e33ea08badc1705a",
  measurementId: "G-KYCQEXJEZS"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===== API FIRESTORE =====
window.FirebaseDB = {

  // --- PRODUTOS ---
  async getProdutos() {
    const snap = await getDocs(collection(db, 'produtos'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async saveProduto(produto) {
    const { id, ...data } = produto;
    if (id) {
      await setDoc(doc(db, 'produtos', id), data);
      return id;
    } else {
      const ref = await addDoc(collection(db, 'produtos'), data);
      return ref.id;
    }
  },
  async deleteProduto(id) {
    await deleteDoc(doc(db, 'produtos', id));
  },

  // --- VENDAS ---
  async getVendas() {
    const snap = await getDocs(collection(db, 'vendas'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async saveVenda(venda) {
    const { id, ...data } = venda;
    const ref = await addDoc(collection(db, 'vendas'), data);
    return ref.id;
  },
  async deleteVenda(id) {
    await deleteDoc(doc(db, 'vendas', id));
  },

  // --- NOTIF IGNORE ---
  async getNotifIgnore() {
    try {
      const snap = await getDocs(collection(db, 'config'));
      const doc_ = snap.docs.find(d => d.id === 'notifIgnore');
      return doc_ ? (doc_.data().ids || []) : [];
    } catch { return []; }
  },
  async saveNotifIgnore(ids) {
    await setDoc(doc(db, 'config', 'notifIgnore'), { ids });
  }
};

// Sinaliza que o Firebase está pronto
// Usa timeout mínimo para garantir que app.js já registrou o listener
setTimeout(() => {
  window._firebaseReady = true;
  window.dispatchEvent(new Event('firebase-ready'));
}, 0);
