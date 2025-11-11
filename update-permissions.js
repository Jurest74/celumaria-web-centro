// Script para actualizar permisos de usuarios existentes
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBGF5gLbKS5QaHiF9FPRYnSuLvDK9KDu8M",
  authDomain: "celumaria-web.firebaseapp.com",
  projectId: "celumaria-web",
  storageBucket: "celumaria-web.firebasestorage.app",
  messagingSenderId: "726100516644",
  appId: "1:726100516644:web:fb2c7013b83a9c5c9d7d2c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function updateUserPermissions() {
  try {
    console.log('🔄 Actualizando permisos de usuarios...');
    
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    let updatedCount = 0;
    
    for (const userDoc of snapshot.docs) {
      const userData = userDoc.data();
      const currentPermissions = userData.permissions || {};
      
      // Verificar si ya tiene el permiso
      if (!currentPermissions.hasOwnProperty('technicalServiceHistory')) {
        // Agregar el nuevo permiso basado en el rol
        const newPermissions = {
          ...currentPermissions,
          technicalServiceHistory: true // Dar acceso a todos por defecto
        };
        
        await updateDoc(doc(db, 'users', userDoc.id), {
          permissions: newPermissions,
          updatedAt: new Date().toISOString()
        });
        
        console.log(`✅ Usuario ${userData.email || userDoc.id} actualizado`);
        updatedCount++;
      } else {
        console.log(`⏭️  Usuario ${userData.email || userDoc.id} ya tiene el permiso`);
      }
    }
    
    console.log(`🎉 Proceso completado. ${updatedCount} usuarios actualizados.`);
    
  } catch (error) {
    console.error('❌ Error actualizando permisos:', error);
  }
  
  process.exit(0);
}

updateUserPermissions();