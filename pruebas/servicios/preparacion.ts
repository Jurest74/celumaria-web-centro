// Se ejecuta antes de cada archivo de pruebas funcionales.
//
// Candado de seguridad: si por cualquier motivo la configuración no quedó
// apuntando al emulador con el proyecto de pruebas, se detiene todo antes de
// leer o escribir un solo documento.
import { firebaseConfig, PROYECTO_PRUEBAS, USAR_EMULADOR } from '../../src/config/firebase';

if (!USAR_EMULADOR || firebaseConfig.projectId !== PROYECTO_PRUEBAS) {
  throw new Error(
    `Las pruebas funcionales solo pueden correr contra el emulador (proyecto ${PROYECTO_PRUEBAS}). ` +
    `Proyecto actual: ${firebaseConfig.projectId}. Usa "npm run pruebas:servicios".`
  );
}
