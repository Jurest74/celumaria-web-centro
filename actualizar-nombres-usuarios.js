// Script para actualizar nombres de usuarios existentes
// Ejecutar en consola del navegador para usuarios que no tengan displayName

async function updateUserDisplayNames() {
  try {
    const { collection, getDocs, doc, updateDoc } = await import('firebase/firestore');
    const { db } = await import('./src/config/firebase.js');
    
    console.log('🔄 Iniciando actualización de nombres de usuarios...');
    
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    console.log(`📊 Encontrados ${snapshot.docs.length} usuarios`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const docId = docSnapshot.id;
      
      console.log(`🔍 Revisando usuario: ${data.email}`);
      
      // Si el usuario no tiene displayName o está vacío
      if (!data.displayName || data.displayName.trim() === '') {
        console.log(`🚀 Actualizando displayName para: ${data.email}`);
        
        try {
          // Crear displayName a partir del email
          const emailPrefix = data.email.split('@')[0];
          const displayName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
          
          // Actualizar el documento
          await updateDoc(doc(db, 'users', docId), {
            displayName: displayName,
            updatedAt: new Date().toISOString()
          });
          
          updatedCount++;
          console.log(`✅ Usuario actualizado: ${data.email} -> ${displayName}`);
          
        } catch (error) {
          console.error(`❌ Error actualizando usuario ${data.email}:`, error);
        }
      } else {
        console.log(`✅ Usuario ya tiene displayName: ${data.email} -> ${data.displayName}`);
        skippedCount++;
      }
    }
    
    console.log(`🎉 Actualización completada:`);
    console.log(`  - Usuarios actualizados: ${updatedCount}`);
    console.log(`  - Usuarios ya con nombre: ${skippedCount}`);
    
  } catch (error) {
    console.error('❌ Error en actualización:', error);
  }
}

// Para usar este script:
// 1. Abre tu aplicación en el navegador
// 2. Abre la consola de desarrollador (F12)
// 3. Copia y pega todo este código
// 4. Ejecuta: updateUserDisplayNames();

console.log('📄 Script de actualización de nombres cargado. Ejecuta: updateUserDisplayNames();');
