import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// 🔥 CONFIGURACIÓN FIREBASE CELU MARIA CENTRO - MODO PRODUCCIÓN
// ⚠️ IMPORTANTE: Base de datos configurada en modo producción con reglas de seguridad

const firebaseConfig = {
  apiKey: "AIzaSyC2qH28cydE9OKg_9cERvQ3IBRReXHPNLo",
  authDomain: "finanzas-personales-60d5c.firebaseapp.com",
  projectId: "finanzas-personales-60d5c",
  storageBucket: "finanzas-personales-60d5c.firebasestorage.app",
  messagingSenderId: "1010030707667",
  appId: "1:1010030707667:web:0a82f7da2be72de30ae526"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Servicios Firebase (100% GRATUITOS)
export const db = getFirestore(app); // Base de datos predeterminada - GRATIS
export const auth = getAuth(app);    // Authentication - GRATIS

export default app;

// 📋 CONFIGURACIÓN CELU MARIA CENTRO:
// ✅ Proyecto: finanzas-personales-60d5c (celumaria-web-centro)
// ✅ Base de datos en modo PRODUCCIÓN con reglas de seguridad
// ✅ Authentication habilitado (email/password)
// ✅ Reglas configuradas para validación de códigos de barras únicos
// ✅ Acceso solo para usuarios autenticados

// 🎯 CARACTERÍSTICAS:
// - Firestore Database en modo producción
// - Reglas de seguridad configuradas
// - Validación automática de barcodes únicos
// - Sistema completo de inventario y ventas
// - Plan Spark (Gratis) con límites generosos