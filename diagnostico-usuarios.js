// Diagnóstico de Estructura de Usuarios
// Ejecutar en la consola del navegador para verificar la estructura

async function diagnosticarUsuarios() {
  try {
    console.log('🔍 DIAGNÓSTICO DE USUARIOS');
    console.log('='.repeat(50));
    
    const { collection, getDocs } = await import('firebase/firestore');
    const { getAuth } = await import('firebase/auth');
    const { db } = await import('./src/config/firebase.js');
    
    // 1. Verificar usuario autenticado
    const auth = getAuth();
    console.log('\n1. 👤 USUARIO AUTENTICADO:');
    if (auth.currentUser) {
      console.log(`✅ Email: ${auth.currentUser.email}`);
      console.log(`✅ UID: ${auth.currentUser.uid}`);
    } else {
      console.log('❌ No hay usuario autenticado');
    }
    
    // 2. Verificar documentos en Firestore
    console.log('\n2. 📄 DOCUMENTOS EN FIRESTORE:');
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    console.log(`📊 Total documentos: ${snapshot.docs.length}`);
    
    let correctStructure = 0;
    let incorrectStructure = 0;
    let missingUid = 0;
    
    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      const docId = doc.id;
      
      console.log(`\n📝 Documento ${index + 1}:`);
      console.log(`  ID del documento: ${docId}`);
      console.log(`  UID en datos: ${data.uid || 'FALTA'}`);
      console.log(`  Email: ${data.email || 'FALTA'}`);
      console.log(`  Role: ${data.role || 'FALTA'}`);
      
      if (!data.uid) {
        console.log('  ❌ PROBLEMA: Sin campo UID');
        missingUid++;
      } else if (data.uid === docId) {
        console.log('  ✅ ESTRUCTURA CORRECTA');
        correctStructure++;
      } else {
        console.log('  ⚠️ PROBLEMA: UID no coincide con ID del documento');
        incorrectStructure++;
      }
    });
    
    // 3. Resumen
    console.log('\n3. 📊 RESUMEN:');
    console.log(`✅ Estructura correcta: ${correctStructure}`);
    console.log(`⚠️ Estructura incorrecta: ${incorrectStructure}`);
    console.log(`❌ Sin UID: ${missingUid}`);
    
    // 4. Verificar usuario específico
    if (auth.currentUser) {
      console.log('\n4. 🔍 VERIFICACIÓN DEL USUARIO ACTUAL:');
      const userDoc = snapshot.docs.find(doc => 
        doc.id === auth.currentUser.uid || 
        doc.data().uid === auth.currentUser.uid
      );
      
      if (userDoc) {
        const userData = userDoc.data();
        console.log('✅ Documento encontrado');
        console.log(`  Método: ${userDoc.id === auth.currentUser.uid ? 'Por ID de documento' : 'Por campo UID'}`);
        console.log(`  Role: ${userData.role}`);
        console.log(`  Activo: ${userData.isActive}`);
        
        if (userDoc.id !== auth.currentUser.uid) {
          console.log('⚠️ RECOMENDACIÓN: Ejecutar migración de usuarios');
        }
      } else {
        console.log('❌ PROBLEMA: No se encontró documento para el usuario actual');
        console.log('💡 SOLUCIÓN: Crear documento manualmente o ejecutar script de reparación');
      }
    }
    
    // 5. Acciones recomendadas
    console.log('\n5. 🚀 ACCIONES RECOMENDADAS:');
    if (incorrectStructure > 0 || missingUid > 0) {
      console.log('📋 Ejecutar script de migración:');
      console.log('   migrateUsersStructure();');
    } else {
      console.log('✅ No se requieren acciones, estructura correcta');
    }
    
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
  }
}

// Función para crear un usuario de prueba con estructura correcta
async function crearUsuarioPrueba() {
  try {
    const { doc, setDoc } = await import('firebase/firestore');
    const { getAuth } = await import('firebase/auth');
    const { db } = await import('./src/config/firebase.js');
    
    const auth = getAuth();
    if (!auth.currentUser) {
      console.log('❌ Debes estar autenticado para crear el documento');
      return;
    }
    
    const userData = {
      uid: auth.currentUser.uid,
      email: auth.currentUser.email,
      displayName: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || '',
      role: 'admin', // Cambiar a 'employee' si no quieres admin
      permissions: {
        dashboard: true,
        inventory: true,
        purchases: true,
        sales: true,
        salesHistory: true,
        purchasesHistory: true,
        layaway: true,
        customers: true,
        categories: true,
        reports: true,
        userManagement: true, // Cambiar a false si no quieres admin
      },
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };
    
    await setDoc(doc(db, 'users', auth.currentUser.uid), userData);
    console.log('✅ Documento de usuario creado correctamente');
    console.log('🔄 Recarga la página para aplicar los cambios');
    
  } catch (error) {
    console.error('❌ Error creando usuario:', error);
  }
}

console.log('🔧 Scripts de diagnóstico cargados:');
console.log('  - diagnosticarUsuarios() - Verificar estructura');
console.log('  - crearUsuarioPrueba() - Crear documento de usuario correcto');
console.log('  - migrateUsersStructure() - Migrar usuarios mal estructurados');
