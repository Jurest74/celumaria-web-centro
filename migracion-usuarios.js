// Migración de Usuarios - Ejecutar en consola del navegador si tienes usuarios mal estructurados

async function migrateUsersStructure() {
  try {
    const { collection, getDocs, doc, setDoc, deleteDoc } = await import('firebase/firestore');
    const { db } = await import('./src/config/firebase.js');
    
    console.log('🔄 Iniciando migración de usuarios...');
    
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    console.log(`📊 Encontrados ${snapshot.docs.length} documentos de usuarios`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const docId = docSnapshot.id;
      
      console.log(`🔍 Revisando documento: ${docId}`);
      
      // Si el documento tiene UID y el ID del documento no coincide con el UID
      if (data.uid && data.uid !== docId) {
        console.log(`🚀 Migrando usuario: ${data.email} (${data.uid})`);
        
        try {
          // Crear nuevo documento con el UID como ID
          await setDoc(doc(db, 'users', data.uid), {
            ...data,
            updatedAt: new Date().toISOString()
          });
          
          // Eliminar el documento anterior si es diferente
          await deleteDoc(docSnapshot.ref);
          
          migratedCount++;
          console.log(`✅ Usuario migrado: ${data.email}`);
          
        } catch (error) {
          console.error(`❌ Error migrando usuario ${data.email}:`, error);
        }
      } else if (!data.uid) {
        console.log(`⚠️ Usuario sin UID encontrado: ${data.email || 'Sin email'} - Documento: ${docId}`);
        // Este usuario necesita ser revisado manualmente
      } else {
        console.log(`✅ Usuario ya estructurado correctamente: ${data.email}`);
        skippedCount++;
      }
    }
    
    console.log(`🎉 Migración completada:`);
    console.log(`  - Usuarios migrados: ${migratedCount}`);
    console.log(`  - Usuarios ya correctos: ${skippedCount}`);
    
  } catch (error) {
    console.error('❌ Error en migración:', error);
  }
}

// Para usar este script:
// 1. Abre tu aplicación en el navegador
// 2. Abre la consola de desarrollador (F12)
// 3. Copia y pega todo este código
// 4. Ejecuta: migrateUsersStructure();

console.log('📄 Script de migración cargado. Ejecuta: migrateUsersStructure();');
