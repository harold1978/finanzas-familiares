// Pega aquí la configuración de tu proyecto Firebase (Consola Firebase → Configuración del proyecto → Tus apps → Web).
// También puedes pegarla desde la propia web en  Ajustes → Conexión Firestore.
// Si lo dejas en null la app funciona en MODO LOCAL (datos guardados solo en este navegador).
window.FIREBASE_CONFIG = null;

window.FIREBASE_CONFIG = {
  apiKey:
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
    'AIzaSyA_CtEojYQ8SHAYCetwFO_P8_H1uHbcqw8',
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    'pollito2026v2.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'pollito2026v2',
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    'pollito2026v2.firebasestorage.app',
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '394757653153',
  appId:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||
    '1:394757653153:web:b47403e4e9f313b5fbe6e0',
};
