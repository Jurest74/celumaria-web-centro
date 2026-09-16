import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  connectFirestoreEmulator
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';

// 🔥 CONFIGURACIÓN FIREBASE CELU MARIA CENTRO - MODO PRODUCCIÓN
// ⚠️ IMPORTANTE: Base de datos configurada en modo producción con reglas de seguridad

const configProduccion = {
  apiKey: "AIzaSyC2qH28cydE9OKg_9cERvQ3IBRReXHPNLo",
  authDomain: "finanzas-personales-60d5c.firebaseapp.com",
  projectId: "finanzas-personales-60d5c",
  storageBucket: "finanzas-personales-60d5c.firebasestorage.app",
  messagingSenderId: "1010030707667",
  appId: "1:1010030707667:web:0a82f7da2be72de30ae526"
};

// MODO PRUEBAS: con VITE_EMULADOR=true la app y las pruebas funcionales usan
// el emulador local de Firebase con datos desechables. El proyecto pasa a ser
// "demo-celumaria": los proyectos "demo-" no existen en Google, así que aunque
// fallara la conexión al emulador ninguna lectura o escritura podría llegar a
// la base de una sede.
const entornoProceso = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
// Un build de producción nunca usa el emulador, aunque la variable quede
// puesta por error en la máquina que compila.
export const USAR_EMULADOR = import.meta.env?.PROD !== true &&
  (import.meta.env?.VITE_EMULADOR === 'true' || entornoProceso?.VITE_EMULADOR === 'true');
export const PROYECTO_PRUEBAS = 'demo-celumaria';
const HOST_EMULADOR = import.meta.env?.VITE_EMULADOR_HOST || entornoProceso?.VITE_EMULADOR_HOST || '127.0.0.1';

export const firebaseConfig = USAR_EMULADOR
  ? { ...configProduccion, projectId: PROYECTO_PRUEBAS, authDomain: `${PROYECTO_PRUEBAS}.firebaseapp.com` }
  : configProduccion;

/** Conecta una instancia de Auth al emulador cuando la app corre en modo pruebas. */
export const conectarAuthAlEmulador = (instancia: Auth) => {
  if (USAR_EMULADOR) {
    connectAuthEmulator(instancia, `http://${HOST_EMULADOR}:9099`, { disableWarnings: true });
  }
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Servicios Firebase (100% GRATUITOS)
//
// Caché persistente en el dispositivo (IndexedDB). Sin esto, cada vez que se
// abre la aplicación Firestore vuelve a descargar todos los documentos que la
// pantalla necesita: con 806 servicios técnicos, eso son 806 lecturas en cada
// apertura. Con la caché, los documentos quedan guardados y en las siguientes
// aperturas solo viaja lo que cambió desde la última vez.
//
// persistentMultipleTabManager permite que varias pestañas compartan esa
// caché; sin él, abrir una segunda pestaña deshabilita la persistencia.
//
// Si el navegador no la admite —modo privado, almacenamiento bloqueado— se
// vuelve a la base sin caché en vez de dejar la aplicación sin funcionar.
let firestore;
if (USAR_EMULADOR) {
  // En pruebas, caché en memoria: cada corrida arranca limpia.
  firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, HOST_EMULADOR, 8080);
} else {
  try {
    firestore = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch (error) {
    console.warn('No se pudo activar la caché persistente de Firestore:', error);
    firestore = getFirestore(app);
  }
}

export const db = firestore;
export const auth = getAuth(app);    // Authentication - GRATIS
conectarAuthAlEmulador(auth);

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