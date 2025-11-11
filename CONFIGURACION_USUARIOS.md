# Configuración de Usuarios y Permisos

## Sistema de Roles

El sistema cuenta con dos tipos de usuarios:

### 1. Administrador (admin)
- Acceso completo a todas las funcionalidades
- Puede gestionar inventario, compras, ventas, clientes, categorías
- Acceso a reportes detallados y configuración del sistema
- Puede ver historiales completos

### 2. Empleado (employee)
- Acceso limitado a funcionalidades básicas
- Puede hacer ventas y gestionar clientes básicamente
- No puede gestionar compras, inventario ni reportes detallados
- Solo puede ver categorías (sin editar)

## Configuración Inicial de Usuarios

### Crear Usuario Administrador

1. **Registro inicial**: Cuando un usuario se registra por primera vez, automáticamente se crea como `employee`.

2. **Cambiar a Admin**: Para crear un administrador, modifica el documento en Firestore usando Firebase Console:

### 🔥 Método 1: Firebase Console (Recomendado)

1. **Ir a Firebase Console**: https://console.firebase.google.com/
2. **Seleccionar tu proyecto**: `dulce-milagro-moda-web`
3. **Ir a Firestore Database** en el menú lateral
4. **Buscar la colección `users`**
5. **Encontrar el documento del usuario** (usar el UID del usuario)
6. **Editar el documento** haciendo clic en el ícono de lápiz
7. **Actualizar los campos**:

```json
{
  "role": "admin",
  "permissions": {
    "dashboard": true,
    "inventory": true,
    "purchases": true,
    "sales": true,
    "salesHistory": true,
    "purchasesHistory": true,
    "layaway": true,
    "customers": true,
    "categories": true,
    "reports": true,
    "userManagement": true
  },
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

8. **Guardar los cambios**

### 🔧 Método 2: Script en Consola (Si funciona)

```javascript
// En la consola de Firebase o a través de código
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './config/firebase';

// ID del usuario que quieres hacer administrador
const userId = "UID_DEL_USUARIO";

await updateDoc(doc(db, 'users', userId), {
  role: 'admin',
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
    userManagement: true,
  },
  updatedAt: new Date().toISOString()
});
```

### Estructura de Documento de Usuario en Firestore

```javascript
// Colección: users
// Documento: {uid_del_usuario}
{
  uid: "firebase_user_uid",
  email: "usuario@ejemplo.com",
  displayName: "Nombre del Usuario",
  role: "admin" | "employee",
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
    userManagement: true,
  },
  isActive: true,
  createdAt: "2025-01-15T...",
  updatedAt: "2025-01-15T...",
  lastLoginAt: "2025-01-15T..."
}
```

## Sistema de Permisos Simplificado

El sistema controla únicamente la **visibilidad de las opciones del menú**. Cada permiso corresponde a un ítem de navegación:

- `dashboard` - Panel de Control
- `inventory` - Inventario  
- `purchases` - Compras
- `sales` - Ventas
- `salesHistory` - Historial de Ventas
- `purchasesHistory` - Historial de Compras
- `layaway` - Plan Separe
- `customers` - Clientes
- `categories` - Categorías
- `reports` - Reportes
- `userManagement` - Gestión de Usuarios (Solo administradores)

### Diferencias de Acceso

**Administrador (admin):**
- Ve y accede a todas las opciones del menú
- Funcionalidad completa en todos los módulos
- **Gestión de Usuarios**: Puede crear, editar, cambiar roles y eliminar usuarios

**Empleado (employee):**
- No ve: Compras, Historial de Compras, Gestión de Usuarios
- Ve el resto de opciones pero con funcionalidad limitada según el componente

## Gestión de Usuarios (Solo Administradores)

Los administradores tienen acceso a un módulo especial de **Gestión de Usuarios** donde pueden:

### ✅ Funcionalidades Disponibles:

1. **Crear nuevos usuarios**
   - Email, contraseña, nombre completo
   - Asignar rol (Administrador o Empleado)
   - Se crean automáticamente con permisos según el rol

2. **Gestionar usuarios existentes**
   - Ver lista completa de usuarios
   - Buscar por nombre o email
   - Ver información de perfil y estado

3. **Cambiar roles**
   - Convertir empleados a administradores
   - Cambiar administradores a empleados
   - Los permisos se actualizan automáticamente

4. **Controlar estado de usuarios**
   - Activar/desactivar usuarios
   - Eliminar usuarios (excepto su propia cuenta)

5. **Información detallada**
   - Fecha de creación
   - Estado activo/inactivo
   - Rol actual con badge visual

### 🔒 Restricciones de Seguridad:

- Solo los administradores pueden acceder al módulo
- No se puede eliminar la propia cuenta
- Los permisos se aplican automáticamente según el rol
- Interfaz protegida con verificación de rol

## Implementación en el Frontend

El sistema verifica automáticamente los permisos y:
1. **Filtra las opciones del menú de navegación** - Solo muestra las opciones permitidas
2. **Controla funcionalidades dentro de componentes** - Basado en el rol del usuario (admin vs employee)

Los permisos se cargan automáticamente desde Firestore cuando el usuario inicia sesión.

## Cómo Funciona

1. **Navegación**: Se filtra automáticamente basándose en los permisos del usuario
2. **Funcionalidades internas**: Cada componente verifica el rol del usuario para mostrar/ocultar opciones específicas
3. **Protección de rutas**: Se verifica automáticamente si el usuario puede acceder a una ruta específica

## Seguridad

- Los permisos se verifican tanto en el frontend como en el backend
- Las reglas de Firestore deben configurarse para respetar estos permisos
- Los usuarios no pueden elevarse sus propios permisos
- Solo administradores pueden gestionar otros usuarios

## Script para Crear Primer Administrador

```javascript
// Ejecutar en la consola del navegador después de registrar un usuario
async function createFirstAdmin(userEmail) {
  const { collection, query, where, getDocs, updateDoc } = await import('firebase/firestore');
  const { db } = await import('./src/config/firebase.js');
  
  // Buscar usuario por email
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', userEmail));
  const querySnapshot = await getDocs(q);
  
  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    await updateDoc(userDoc.ref, {
      role: 'admin',
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
        userManagement: true,
      },
      updatedAt: new Date().toISOString()
    });
    console.log('Usuario convertido a administrador');
  } else {
    console.log('Usuario no encontrado');
  }
}

// Uso:
// createFirstAdmin('admin@dulcemilagro.com');
```

## Script Alternativo (si tienes acceso al archivo userManagement.ts)

```javascript
// En la consola del navegador
import { promoteUserToAdmin } from './src/utils/userManagement.js';
promoteUserToAdmin('admin@dulcemilagro.com');
```

## ⚠️ Solución de Problemas

### Error: "access to Firestore programmatically"

Si recibes errores al intentar acceder a Firestore desde código, sigue estos pasos:

#### Opción 1: Usar Firebase Console (Más Seguro)
1. Ve directamente a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto
3. Ve a **Firestore Database**
4. Busca la colección `users`
5. Encuentra el documento del usuario por su UID
6. Edita manualmente los campos `role` y `permissions`

#### Opción 2: Verificar Reglas de Firestore
```javascript
// firestore.rules - Asegúrate que las reglas permiten escritura
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

#### Opción 3: Verificar Autenticación
```javascript
// En la consola del navegador
import { getAuth } from 'firebase/auth';
const auth = getAuth();
console.log('Usuario autenticado:', auth.currentUser);
console.log('UID:', auth.currentUser?.uid);
```

#### Opción 4: Script Directo en Consola del Navegador
```javascript
// 1. Abrir la aplicación en el navegador
// 2. Asegurarse de estar logueado
// 3. Abrir consola de desarrollador (F12)
// 4. Ejecutar:

async function promoteToAdmin() {
  try {
    const { doc, updateDoc } = await import('firebase/firestore');
    const { db } = await import('./src/config/firebase.js');
    const { getAuth } = await import('firebase/auth');
    
    const auth = getAuth();
    if (!auth.currentUser) {
      console.error('Usuario no autenticado');
      return;
    }
    
    const userId = auth.currentUser.uid;
    console.log('Promoviendo usuario:', userId);
    
    await updateDoc(doc(db, 'users', userId), {
      role: 'admin',
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
        userManagement: true,
      },
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Usuario convertido a administrador');
    console.log('Recargar la página para ver los cambios');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.log('💡 Usa Firebase Console manualmente');
  }
}

// Ejecutar
promoteToAdmin();
```

### Error: "Usuario no encontrado"
1. Verifica que el usuario esté registrado en Authentication
2. Verifica que existe un documento en la colección `users`
3. Asegúrate de usar el UID correcto (no el email)

### Error: "Permission denied"
1. Verifica las reglas de Firestore
2. Asegúrate de estar autenticado
3. Usa Firebase Console en lugar de código

### Error: "Usuario creado pero no puede iniciar sesión"

Este error ocurre cuando hay una inconsistencia entre la estructura de documentos en Firestore. Sigue estos pasos:

#### 🔧 Solución Rápida:

1. **Verificar estructura en Firebase Console:**
   - Ve a Firestore Database
   - Abre la colección `users`
   - Verifica que cada documento tenga como ID el mismo valor que el campo `uid` interno

2. **Estructura correcta:**
   ```
   Colección: users
   ├── documento: ABC123XYZ (UID de Firebase Auth)
   │   ├── uid: "ABC123XYZ" (mismo valor)
   │   ├── email: "usuario@ejemplo.com"
   │   ├── role: "admin" | "employee"
   │   └── permissions: {...}
   ```

3. **Si la estructura está mal, usar script de migración:**
   ```javascript
   // En la consola del navegador:
   // (Copiar contenido del archivo migracion-usuarios.js)
   migrateUsersStructure();
   ```

#### 🚨 Síntomas del problema:
- Usuario aparece en Firebase Authentication ✅
- Usuario aparece en Firestore Database ✅
- Al intentar login: "Usuario o contraseña incorrectos" ❌

#### 💡 Causa del problema:
- El documento del usuario se creó con un ID auto-generado por `addDoc()`
- El sistema busca el usuario por su UID de Firebase Auth
- No encuentra coincidencia entre el ID del documento y el UID
