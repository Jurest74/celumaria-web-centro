# 🆓 Firebase COMPLETAMENTE GRATIS - Guía Paso a Paso

## ⚠️ IMPORTANTE: NO PAGARÁS NADA

Esta configuración usa **SOLO** servicios gratuitos de Firebase. No necesitas tarjeta de crédito.

## Paso 1: Crear Proyecto Firebase (GRATIS)

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Clic en **"Crear un proyecto"**
3. Nombre: `dulce-milagro-moda`
4. **DESHABILITA** Google Analytics (mantiene todo gratis)
5. Clic en **"Crear proyecto"**

## Paso 2: Firestore Database (GRATIS - Base Predeterminada)

1. Panel izquierdo → **"Firestore Database"**
2. Clic en **"Crear base de datos"**
3. **IMPORTANTE**: Selecciona **"Comenzar en modo de prueba"**
4. Ubicación: **"us-central1"** (recomendado)
5. Clic en **"Listo"**

**✅ CONFIRMACIÓN**: Verás que dice "Base de datos predeterminada" - esto es GRATIS

## Paso 3: Authentication (GRATIS)

1. Panel izquierdo → **"Authentication"**
2. Clic en **"Comenzar"**
3. Pestaña **"Sign-in method"**
4. Clic en **"Correo electrónico/contraseña"**
5. **Habilitar** la primera opción
6. Clic en **"Guardar"**

## Paso 4: Obtener Configuración

1. Ícono ⚙️ → **"Configuración del proyecto"**
2. Sección **"Tus apps"**
3. Clic en ícono web `</>`
4. Nombre: `dulce-milagro-moda-web`
5. **NO marcar** "Firebase Hosting" (para mantenerlo gratis)
6. Clic en **"Registrar app"**
7. **COPIAR** la configuración:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

## Paso 5: Configurar Código

Reemplaza en `src/config/firebase.ts`:

```typescript
const firebaseConfig = {
  // PEGA AQUÍ TU CONFIGURACIÓN REAL
  apiKey: "tu-api-key-real",
  authDomain: "tu-proyecto.firebaseapp.com", 
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "tu-sender-id",
  appId: "tu-app-id"
};
```

## Paso 6: Crear Usuario Admin

### En Firebase Console:
1. **Authentication** → **"Agregar usuario"**
2. Email: `admin@dulcemilagro.com`
3. Contraseña: `admin123`
4. **Copiar el UID** que se genera

### En Firestore Database:
1. **"Iniciar colección"**
2. ID: `users`
3. **"Siguiente"**
4. ID del documento: **PEGAR EL UID COPIADO**
5. Campos:
   - `email` (string): `admin@dulcemilagro.com`
   - `username` (string): `admin`
   - `role` (string): `admin`
   - `createdAt` (string): `2025-01-01T00:00:00.000Z`
6. **"Guardar"**

## Paso 7: Reglas de Seguridad (Desarrollo)

En **Firestore Database** → **"Reglas"**, reemplazar con:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Modo desarrollo - acceso completo para usuarios autenticados
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Clic en **"Publicar"**

## Paso 8: Ejecutar Aplicación

```bash
npm install
npm run dev
```

## Paso 9: Login

- **Email**: `admin@dulcemilagro.com`
- **Contraseña**: `admin123`

## 🎯 Confirmaciones de que es GRATIS

### En Firebase Console verás:
- ✅ "Plan Spark (Gratis)" en la parte superior
- ✅ "Base de datos predeterminada" en Firestore
- ✅ Sin solicitud de tarjeta de crédito
- ✅ Cuotas gratuitas mostradas

### Límites generosos GRATIS:
- 📖 **50,000 lecturas/día**
- ✍️ **20,000 escrituras/día**
- 🗑️ **20,000 eliminaciones/día**
- 💾 **1GB almacenamiento**
- 👥 **Usuarios ilimitados**

## ❌ Lo que NO haremos (para mantenerlo gratis):

- ❌ No crear bases de datos con nombre personalizado
- ❌ No habilitar servicios pagados
- ❌ No usar Cloud Functions (por ahora)
- ❌ No usar Firebase Hosting (usaremos Vite local)

## 🚨 Si ves advertencias sobre facturación:

1. **Ignóralas** - son para servicios premium
2. Mantente en el **Plan Spark (Gratis)**
3. Solo usa la **base de datos predeterminada**
4. No habilites servicios adicionales

## 📊 Monitoreo de Uso (para estar seguro):

1. Firebase Console → **"Uso"**
2. Verás tus cuotas diarias
3. Todo debe estar en verde (dentro del límite gratuito)

---

## ✅ GARANTÍA: 100% GRATIS

Esta configuración NO te cobrará nada. Firebase tiene un plan gratuito muy generoso que es perfecto para tu negocio.

**¿Dudas?** Revisa que:
- Estés en Plan Spark (Gratis)
- Uses la base de datos predeterminada
- No habilites servicios premium

¡Tu sistema funcionará perfectamente sin costos! 🎉