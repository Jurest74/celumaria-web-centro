import { collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { DEFAULT_PERMISSIONS } from '../utils/permissions';

/**
 * Script para promover un usuario a administrador
 * IMPORTANTE: Solo usar este script una vez para crear el primer administrador
 * Después usar la interfaz de administración para gestionar usuarios
 */

export const promoteUserToAdmin = async (userEmail: string): Promise<boolean> => {
  try {
    // Buscar usuario por email
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', userEmail));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.error('Usuario no encontrado con email:', userEmail);
      return false;
    }

    const userDoc = querySnapshot.docs[0];
    
    // Actualizar a administrador
    await updateDoc(userDoc.ref, {
      role: 'admin',
      permissions: DEFAULT_PERMISSIONS.admin,
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Usuario promovido a administrador exitosamente');
    return true;
  } catch (error) {
    console.error('❌ Error promoviendo usuario a admin:', error);
    return false;
  }
};

export const demoteUserToEmployee = async (userEmail: string): Promise<boolean> => {
  try {
    // Buscar usuario por email
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', userEmail));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.error('Usuario no encontrado con email:', userEmail);
      return false;
    }

    const userDoc = querySnapshot.docs[0];
    
    // Actualizar a empleado
    await updateDoc(userDoc.ref, {
      role: 'employee',
      permissions: DEFAULT_PERMISSIONS.employee,
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Usuario convertido a empleado exitosamente');
    return true;
  } catch (error) {
    console.error('❌ Error convirtiendo usuario a empleado:', error);
    return false;
  }
};

// Función para usar en la consola del navegador
// Descomentar y ejecutar según necesidad:

/*
// Para promover a admin:
promoteUserToAdmin('admin@dulcemilagro.com').then(success => {
  if (success) {
    alert('Usuario promovido a administrador. Debe cerrar sesión y volver a iniciar para ver los cambios.');
  } else {
    alert('Error promoviendo usuario. Ver consola para detalles.');
  }
});
*/

/*
// Para convertir a empleado:
demoteUserToEmployee('empleado@dulcemilagro.com').then(success => {
  if (success) {
    alert('Usuario convertido a empleado. Debe cerrar sesión y volver a iniciar para ver los cambios.');
  } else {
    alert('Error convirtiendo usuario. Ver consola para detalles.');
  }
});
*/
