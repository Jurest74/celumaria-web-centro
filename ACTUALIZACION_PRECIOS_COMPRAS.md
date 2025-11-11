# Actualización de Compras - Gestión de Precios de Venta

## Nueva Funcionalidad: Actualización de Precios de Venta en Compras

### ¿Qué es nuevo?

Ahora cuando registres una compra, además de actualizar el inventario y los precios de compra, también puedes **actualizar los precios de venta** de los productos. Esto te permite mantener tus márgenes de ganancia actualizados automáticamente.

### Cómo funciona

#### 1. **Formulario de Compra Mejorado**
- **Precio de Compra**: El costo por unidad del producto que estás comprando
- **Nuevo Precio de Venta**: El precio al que vas a vender el producto después de esta compra

#### 2. **Selección de Productos**
Cuando seleccionas un producto:
- Se auto-completan los precios actuales de compra y venta
- Puedes modificar ambos precios según necesites
- En la lista desplegable verás: Stock actual, precio de compra, precio de venta y margen de ganancia

#### 3. **Visualización en la Compra**
Para cada producto agregado puedes ver y editar:
- **Cantidad**: Cuántas unidades estás comprando
- **Precio Compra**: Costo unitario de compra (editable)
- **Precio Venta**: Nuevo precio de venta (editable)
- **Total**: Costo total de ese producto

#### 4. **Actualización Automática del Inventario**
Cuando completas la compra, el sistema automáticamente:
- ✅ Aumenta el stock del producto
- ✅ Actualiza el precio de compra (promedio ponderado)
- ✅ **NUEVO**: Actualiza el precio de venta con el valor especificado
- ✅ Registra el historial de la compra

### Ejemplos de Uso

#### Ejemplo 1: Compra Regular
```
Producto: Blusa Rosa
- Stock actual: 5 unidades
- Precio compra actual: $15.000
- Precio venta actual: $25.000
- Margen actual: 40%

Nueva Compra:
- Cantidad: 10 unidades
- Precio compra nuevo: $12.000
- Precio venta nuevo: $22.000

Resultado:
- Stock final: 15 unidades
- Precio compra promedio: $13.000 ((5×15.000 + 10×12.000) ÷ 15)
- Precio venta actualizado: $22.000
- Nuevo margen: 41%
```

#### Ejemplo 2: Ajuste de Precios por Inflación
```
Producto: Pantalón Jeans
- Compras 20 unidades a $18.000 c/u
- Debido a inflación, decides subir precio de venta de $30.000 a $35.000
- El sistema actualiza automáticamente el precio en el inventario
```

### Ventajas

1. **Gestión Centralizada**: Actualiza precios de compra y venta en un solo lugar
2. **Márgenes Dinámicos**: Mantén márgenes de ganancia actualizados automáticamente
3. **Decisiones Informadas**: Ve el margen de ganancia antes de confirmar la compra
4. **Historial Completo**: Todos los cambios quedan registrados en el historial de compras
5. **Control Total**: Puedes editar cualquier precio antes de confirmar

### Consejos de Uso

#### 💡 **Cálculo de Márgenes**
- **Margen = (Precio Venta - Precio Compra) ÷ Precio Venta × 100**
- Ejemplo: Compras a $10.000, vendes a $15.000 → Margen = 33%

#### 💡 **Estrategias de Precios**
- **Productos de alta rotación**: Márgenes menores (20-30%)
- **Productos exclusivos**: Márgenes mayores (40-60%)
- **Productos estacionales**: Ajustar según temporada

#### 💡 **Mejores Prácticas**
- Revisa márgenes competitivos en el mercado
- Considera costos operativos (local, servicios, personal)
- Actualiza precios regularmente según costos de proveedores
- Usa números redondos para facilitar ventas ($25.000 en lugar de $24.500)

### Interfaz Actualizada

#### **Vista de Lista de Productos**
```
📦 Blusa Rosa
   Stock: 15 | Compra: $13.000 | Venta: $22.000
   Margen: 41%
```

#### **Formulario de Compra**
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│   Cantidad  │   Compra    │    Venta    │   Acción    │
├─────────────┼─────────────┼─────────────┼─────────────┤
│      5      │  $12.000    │  $22.000    │  [Agregar]  │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

#### **Items en la Compra**
```
🛍️ Blusa Rosa
   5 unidades × $12.000
   Precio venta: $22.000
   
   [−] 5 [+]    Total: $60.000    [×]
   Compra: $12.000
   Venta:  $22.000
```

### Notas Técnicas

- Los precios se almacenan sin decimales (pesos colombianos)
- El precio de compra se calcula como promedio ponderado automáticamente
- El precio de venta se actualiza al valor exacto que especifiques
- Todo queda registrado en el historial para auditoría

---

**¿Tienes preguntas?** Esta funcionalidad está diseñada para simplificar la gestión de precios y mantener tus márgenes de ganancia siempre actualizados.
