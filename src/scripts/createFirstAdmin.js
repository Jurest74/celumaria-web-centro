// SCRIPT TEMPORAL - ELIMINAR DESPUÉS DE USAR
// Archivo: src/scripts/createFirstAdmin.js

import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { DEFAULT_PERMISSIONS } from '../utils/permissions';

export const createFirstAdmin = async (userEmail) => {
  try {
    console.log('🔍 Buscando usuario con email:', userEmail);
    
    // Buscar usuario por email
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', userEmail));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.error('❌ Usuario no encontrado con email:', userEmail);
      console.log('📝 Verifica que:');
      console.log('  - El email sea exactamente como se registró');
      console.log('  - El usuario ya se haya registrado en la aplicación');
      return false;
    }

    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();
    
    console.log('👤 Usuario encontrado:', userData);
    
    // Actualizar a administrador
    await updateDoc(userDoc.ref, {
      role: 'admin',
      permissions: DEFAULT_PERMISSIONS.admin,
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ ¡Usuario promovido a administrador exitosamente!');
    console.log('🔄 El usuario debe cerrar sesión y volver a iniciar para ver los cambios');
    return true;
    
  } catch (error) {
    console.error('❌ Error promoviendo usuario a admin:', error);
    return false;
  }
};

// Para usar este script:
// 1. Importa esta función en cualquier componente
// 2. Llámala con el email del usuario
// 3. Elimina este archivo después de usar

/*
// EJEMPLO DE USO:
import { createFirstAdmin } from './scripts/createFirstAdmin';

// En algún componente o en la consola:
createFirstAdmin('admin@dulcemilagro.com');
*/
