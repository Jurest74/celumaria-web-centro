// Script para agregar campo "referencia" a productos existentes
// Ejecutar en la consola del navegador en Firebase Console o como script de Node.js

// Para ejecutar en Firebase Console (JavaScript):
// 1. Ve a https://console.firebase.google.com/
// 2. Selecciona tu proyecto
// 3. Ve a Firestore Database
// 4. Abre la consola del navegador (F12)
// 5. Pega este código y ejecútalo

async function agregarCampoReferencia() {
  console.log('🔄 Iniciando actualización de productos para agregar campo referencia...');
  
  try {
    // Obtener referencia a la colección de productos
    const productosRef = firebase.firestore().collection('products');
    
    // Obtener todos los productos
    const snapshot = await productosRef.get();
    
    if (snapshot.empty) {
      console.log('❌ No se encontraron productos en la base de datos');
      return;
    }
    
    console.log(`📊 Se encontraron ${snapshot.size} productos`);
    
    const batch = firebase.firestore().batch();
    let actualizados = 0;
    let yaExistentes = 0;
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      
      // Solo actualizar si no tiene el campo referencia
      if (!data.hasOwnProperty('referencia')) {
        batch.update(doc.ref, {
          referencia: '', // Campo vacío por defecto
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        actualizados++;
        console.log(`✅ Agregando campo referencia a: ${data.name}`);
      } else {
        yaExistentes++;
        console.log(`ℹ️  Ya tiene campo referencia: ${data.name}`);
      }
    });
    
    if (actualizados > 0) {
      await batch.commit();
      console.log(`🎉 ¡Actualización completada!`);
      console.log(`✅ Productos actualizados: ${actualizados}`);
      console.log(`ℹ️  Productos que ya tenían el campo: ${yaExistentes}`);
      console.log(`📊 Total procesados: ${snapshot.size}`);
    } else {
      console.log('ℹ️  Todos los productos ya tienen el campo referencia');
    }
    
  } catch (error) {
    console.error('❌ Error al actualizar productos:', error);
  }
}

// Ejecutar la función
agregarCampoReferencia();

// Instrucciones para Node.js:
// 1. Instalar firebase-admin: npm install firebase-admin
// 2. Configurar credenciales de servicio
// 3. Descomentar y adaptar el código siguiente:

/*
const admin = require('firebase-admin');
const serviceAccount = require('./path/to/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function agregarCampoReferenciaNode() {
  console.log('🔄 Iniciando actualización de productos para agregar campo referencia...');
  
  try {
    const productosRef = db.collection('products');
    const snapshot = await productosRef.get();
    
    if (snapshot.empty) {
      console.log('❌ No se encontraron productos en la base de datos');
      return;
    }
    
    console.log(`📊 Se encontraron ${snapshot.size} productos`);
    
    const batch = db.batch();
    let actualizados = 0;
    let yaExistentes = 0;
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      
      if (!data.hasOwnProperty('referencia')) {
        batch.update(doc.ref, {
          referencia: '',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        actualizados++;
        console.log(`✅ Agregando campo referencia a: ${data.name}`);
      } else {
        yaExistentes++;
        console.log(`ℹ️  Ya tiene campo referencia: ${data.name}`);
      }
    });
    
    if (actualizados > 0) {
      await batch.commit();
      console.log(`🎉 ¡Actualización completada!`);
      console.log(`✅ Productos actualizados: ${actualizados}`);
      console.log(`ℹ️  Productos que ya tenían el campo: ${yaExistentes}`);
      console.log(`📊 Total procesados: ${snapshot.size}`);
    } else {
      console.log('ℹ️  Todos los productos ya tienen el campo referencia');
    }
    
  } catch (error) {
    console.error('❌ Error al actualizar productos:', error);
  }
}

agregarCampoReferenciaNode();
*/
