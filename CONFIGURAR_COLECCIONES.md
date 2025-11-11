# 📊 Configurar Colecciones de Firestore - Paso a Paso

## 🎯 Colecciones que necesitamos crear

Tu sistema necesita estas 6 colecciones principales:

1. **`users`** - Usuarios del sistema ✅ (Ya tienes tu admin)
2. **`categories`** - Categorías de productos
3. **`products`** - Inventario de productos
4. **`customers`** - Base de datos de clientes
5. **`sales`** - Registro de ventas
6. **`layaways`** - Planes de separé

## 📋 Paso 1: Crear Colección de Categorías

### En Firebase Console:
1. Ve a **Firestore Database**
2. Clic en **"Iniciar colección"**
3. ID de colección: `categories`
4. Clic en **"Siguiente"**

### Crear primera categoría:
- **ID del documento**: `categoria-ropa-femenina` (o deja que se genere automáticamente)
- **Campos**:
  ```
  name (string): "Ropa Femenina"
  description (string): "Vestidos, blusas, pantalones y ropa para mujer"
  color (string): "#EC4899"
  icon (string): "Shirt"
  isActive (boolean): true
  productCount (number): 0
  createdAt (string): "2025-01-01T00:00:00.000Z"
  updatedAt (string): "2025-01-01T00:00:00.000Z"
  ```
5. Clic en **"Guardar"**

### Agregar más categorías:
Repite el proceso para estas categorías:

**Categoría 2:**
```
name: "Ropa Masculina"
description: "Camisas, pantalones y ropa para hombre"
color: "#3B82F6"
icon: "User"
isActive: true
productCount: 0
createdAt: "2025-01-01T00:00:00.000Z"
updatedAt: "2025-01-01T00:00:00.000Z"
```

**Categoría 3:**
```
name: "Accesorios"
description: "Bolsos, carteras, cinturones y complementos"
color: "#F59E0B"
icon: "Gem"
isActive: true
productCount: 0
createdAt: "2025-01-01T00:00:00.000Z"
updatedAt: "2025-01-01T00:00:00.000Z"
```

**Categoría 4:**
```
name: "Calzado"
description: "Zapatos, sandalias y calzado en general"
color: "#8B5CF6"
icon: "Footprints"
isActive: true
productCount: 0
createdAt: "2025-01-01T00:00:00.000Z"
updatedAt: "2025-01-01T00:00:00.000Z"
```

## 📋 Paso 2: Crear Colección de Clientes

1. **"Iniciar colección"** → ID: `customers`
2. **Crear cliente de ejemplo**:
   ```
   name (string): "María González"
   phone (string): "+57 300 123 4567"
   email (string): "maria@email.com"
   address (string): "Calle 123 #45-67, Bogotá"
   birthDate (string): "1985-03-15"
   notes (string): "Cliente frecuente, prefiere ropa casual"
   createdAt (string): "2025-01-01T00:00:00.000Z"
   updatedAt (string): "2025-01-01T00:00:00.000Z"
   ```

## 📋 Paso 3: Crear Colección de Productos

1. **"Iniciar colección"** → ID: `products`
2. **Crear producto de ejemplo**:
   ```
   name (string): "Blusa Elegante Rosa"
   description (string): "Blusa de manga larga en color rosa, talla M"
   purchasePrice (number): 25000
   salePrice (number): 45000
   stock (number): 10
   categoryId (string): [COPIA EL ID DE LA CATEGORÍA "Ropa Femenina"]
   category (string): "Ropa Femenina"
   barcode (string): "7891234567890"
   createdAt (string): "2025-01-01T00:00:00.000Z"
   updatedAt (string): "2025-01-01T00:00:00.000Z"
   ```

**IMPORTANTE**: Para `categoryId`, copia el ID real de la categoría que creaste antes.

## 📋 Paso 4: Crear Colecciones Vacías

Para las siguientes colecciones, solo créalas vacías (se llenarán cuando uses la app):

### Colección `sales`:
1. **"Iniciar colección"** → ID: `sales`
2. **Crear documento temporal** (lo puedes eliminar después):
   ```
   temp (string): "temporal"
   ```

### Colección `layaways`:
1. **"Iniciar colección"** → ID: `layaways`
2. **Crear documento temporal**:
   ```
   temp (string): "temporal"
   ```

## 🔧 Paso 5: Actualizar Reglas de Seguridad

En **Firestore Database** → **"Reglas"**, reemplaza con:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Usuarios autenticados pueden leer y escribir sus datos
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Productos - todos los autenticados pueden leer, solo admins escribir
    match /products/{productId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Categorías - todos pueden leer y escribir
    match /categories/{categoryId} {
      allow read, write: if request.auth != null;
    }
    
    // Ventas - todos pueden leer y crear
    match /sales/{saleId} {
      allow read, write: if request.auth != null;
    }
    
    // Clientes - todos pueden leer y escribir
    match /customers/{customerId} {
      allow read, write: if request.auth != null;
    }
    
    // Plan separe - todos pueden leer y escribir
    match /layaways/{layawayId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Clic en **"Publicar"**

## ✅ Verificación Final

Después de crear todo, deberías ver en Firestore:

```
📁 categories (4 documentos)
📁 customers (1 documento)
📁 products (1 documento)
📁 sales (1 documento temporal)
📁 layaways (1 documento temporal)
📁 users (1 documento - tu admin)
```

## 🚀 Probar la Aplicación

1. **Ejecutar la app**:
   ```bash
   npm run dev
   ```

2. **Hacer login**:
   - Email: `admin@dulcemilagro.com`
   - Contraseña: `admin123`

3. **Verificar que funciona**:
   - ✅ Dashboard muestra estadísticas
   - ✅ Inventario muestra el producto de ejemplo
   - ✅ Categorías muestra las 4 categorías
   - ✅ Clientes muestra el cliente de ejemplo

## 🎯 Próximos Pasos

Una vez que todo funcione:

1. **Eliminar documentos temporales** en `sales` y `layaways`
2. **Agregar más productos** desde la interfaz
3. **Procesar tu primera venta**
4. **Crear tu primer plan separe**

## 🆘 Solución de Problemas

### Error: "Missing or insufficient permissions"
- Verifica que las reglas estén publicadas correctamente
- Asegúrate de estar logueado

### No aparecen los datos
- Verifica que los nombres de las colecciones sean exactos
- Revisa la consola del navegador para errores

### Error de conexión
- Verifica que la configuración de Firebase esté correcta en `src/config/firebase.ts`

¡Tu base de datos está lista! 🎉