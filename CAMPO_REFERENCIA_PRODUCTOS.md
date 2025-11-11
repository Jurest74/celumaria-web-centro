# Campo Referencia en Productos

## 📋 Descripción

Se ha agregado un nuevo campo **"referencia"** al sistema de productos que permite:

- Asignar códigos de referencia personalizados a los productos (SKU, códigos internos, etc.)
- Buscar productos por referencia en todos los componentes del sistema
- Mostrar la referencia en tablas, tarjetas y selectores de productos

## ✨ Características Implementadas

### 1. Campo Referencia en Productos
- **Tipo**: Opcional (string)
- **Ubicación**: Se agregó al tipo `Product` en `src/types/index.ts`
- **Ejemplos de uso**: "REF001", "SKU123", "COD-VESTIDO-001", etc.

### 2. Interfaz de Usuario

#### Formulario de Productos (Inventario)
- ✅ Campo "Referencia (Opcional)" en el formulario de agregar/editar productos
- ✅ Placeholder informativo: "Ej: REF001, SKU123, etc."
- ✅ Se ubica entre el nombre y la categoría del producto

#### Tabla de Inventario
- ✅ Nueva columna "Referencia" en la tabla de productos
- ✅ Muestra la referencia o "-" si está vacía
- ✅ Columna ubicada después del nombre del producto

#### Tarjetas Móviles
- ✅ Muestra la referencia en formato "Ref: CODIGO" debajo del nombre
- ✅ Solo se muestra si el producto tiene referencia asignada

### 3. Funcionalidad de Búsqueda

#### Inventario
- ✅ Búsqueda por referencia en el campo de búsqueda principal
- ✅ Placeholder actualizado: "Buscar por nombre, descripción o referencia..."

#### Selector de Productos POS
- ✅ Búsqueda por referencia en el dropdown de productos
- ✅ Muestra la referencia en el dropdown: "Ref: CODIGO • Precio • Stock"
- ✅ Muestra la referencia en items seleccionados

#### Selector de Productos Apartados
- ✅ Búsqueda por referencia en el componente de apartados
- ✅ Misma funcionalidad que el selector POS

### 4. Componentes Actualizados

| Componente | Archivo | Cambios |
|------------|---------|---------|
| Tipos | `src/types/index.ts` | ✅ Campo `referencia?: string` |
| Inventario | `src/components/Inventory.tsx` | ✅ Formulario, tabla, tarjetas, búsqueda |
| Selector POS | `src/components/ProductPOSSelector.tsx` | ✅ Interface, dropdown, búsqueda |
| Selector Apartados | `src/components/AddProductsToLayawayPOS.tsx` | ✅ Interface, dropdown, búsqueda |

## 🔧 Migración

### Para Productos Existentes

Se incluye un script de migración (`agregar-campo-referencia.js`) que:

1. **Detecta** productos sin el campo referencia
2. **Agrega** el campo con valor vacío (`""`)
3. **Actualiza** el timestamp `updatedAt`
4. **Muestra** progreso detallado

#### Ejecución en Firebase Console:
```javascript
// Copiar y pegar el código del script en la consola del navegador
// en Firebase Console -> Firestore Database
```

#### Ejecución con Node.js:
```bash
# Instalar dependencias
npm install firebase-admin

# Configurar credenciales y ejecutar
node agregar-campo-referencia.js
```

## 💡 Uso Recomendado

### Ejemplos de Referencias
- **SKU**: `SKU123`, `SKU-VESTIDO-001`
- **Códigos internos**: `REF001`, `PROD-2024-001`
- **Códigos de barras**: Si no usas el campo barcode específico
- **Códigos de proveedor**: `PROV-ABC-123`

### Flujo de Trabajo
1. **Crear producto**: Asignar referencia en el formulario (opcional)
2. **Buscar**: Usar la referencia en cualquier campo de búsqueda
3. **Identificar**: La referencia aparece en todas las vistas de productos

## 🔍 Búsqueda Mejorada

La búsqueda ahora incluye:
- ✅ Nombre del producto
- ✅ Descripción del producto
- ✅ **Referencia del producto** (nuevo)

Esto permite encontrar productos rápidamente usando códigos internos o referencias específicas.

## 📱 Compatibilidad

- ✅ **Responsive**: Funciona en desktop y móvil
- ✅ **Retrocompatible**: Productos existentes funcionan sin problemas
- ✅ **Opcional**: No es obligatorio asignar referencia
- ✅ **Flexible**: Acepta cualquier formato de referencia

## 🛠️ Mantenimiento

### Campos Relacionados
- `referencia`: Nuevo campo de referencia
- `barcode`: Campo existente para códigos de barras (diferente propósito)
- `name`: Nombre principal del producto
- `description`: Descripción del producto

### Validaciones
- ✅ Campo opcional (no requerido)
- ✅ No hay validación de duplicados (permite códigos iguales)
- ✅ Se guarda tal como se ingresa (sin transformaciones)

### Indexación Firestore
No requiere índices especiales ya que las búsquedas se realizan en memoria después de cargar los productos.

## 📊 Beneficios

1. **Organización**: Mejor categorización con códigos únicos
2. **Búsqueda rápida**: Encuentra productos por código de referencia
3. **Integración**: Compatible con sistemas de códigos existentes
4. **Flexibilidad**: No impone formato específico de referencia
5. **Usabilidad**: Mejora la experiencia en POS y gestión de inventario
