# Pruebas funcionales del core

Verifican que el negocio cuadra: stock, dinero y registros contables. Corren
contra el **emulador local de Firebase** con datos inventados que desaparecen
al terminar. Nunca tocan la base de ninguna sede: la app usa el proyecto
`demo-celumaria`, que no existe en Google, y cada suite se detiene si no está
apuntando al emulador.

## Requisitos (una sola vez)

```bash
brew install openjdk          # el emulador de Firestore necesita Java
npx playwright install chromium
```

Si `java` no queda en el PATH:
`export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`

## Cómo correrlas

```bash
npm run pruebas:servicios   # ~20 s — lógica de servicios contra el emulador
npm run pruebas:navegador   # ~1 min — la app real en Chromium, como un cajero
npm run pruebas:todo        # las dos
```

Si alguna prueba de navegador falla, el reporte con capturas, video y traza
queda en `pruebas/reporte-navegador/index.html`.

## Qué cubren

### Servicios (`pruebas/servicios`)
- **Ventas e inventario:** descuento exacto de stock; venta sin stock no deja
  rastro; cortesías cuentan para el stock; **dos cajas vendiendo la última
  unidad al mismo tiempo: solo una pasa**; borrar venta devuelve stock una sola
  vez aunque se borre desde dos equipos; abonos no tocan stock.
- **Compras y devoluciones:** stock y costo promedio; borrar compra revierte;
  devolución de producto recalcula la venta y acredita saldo; no se devuelve
  más de lo vendido.
- **Ajustes manuales:** editar un producto no pisa ventas hechas mientras el
  formulario estaba abierto; un conteo sobre un stock desactualizado se rechaza.
- **Plan separe:** reserva de stock; cliente sin correo; agregar productos;
  **dos abonos simultáneos no se pierden**; cancelar devuelve lo no recogido y
  acredita saldo, y no duplica si se cancela dos veces.
- **Servicio técnico:** cortesías; borrar un pago desde Gestión de Ventas.
- **Saldo a favor:** no se gasta dos veces desde dos cajas; no queda negativo.

### Navegador (`pruebas/navegador`)
- **Ventas:** efectivo; tarjeta con recargo 3 % y comisión 4 %; pagos múltiples
  efectivo + tarjeta; no deja agregar más unidades que el stock.
- **Plan separe, ciclo completo:** crear con abono → abonar → cancelar abono →
  completar (entrega automática) → reabrir borrando el abono desde Gestión de
  Ventas → cancelar el plan (stock de vuelta y saldo a favor).
- **Servicio técnico:** crear → instalar repuesto → cobrar → finalizar →
  **liquidar al técnico**; editar el precio recalcula la parte del técnico;
  cancelar con devolución registra el egreso.
- **Inventario:** cambiar el precio mientras se vende no altera el stock; conteo
  manual desactualizado se rechaza; conteo vigente queda en la auditoría.

## Errores reales que encontraron

- **Plan separe no se podía crear para clientes sin correo** (Firestore
  rechazaba `customerEmail: undefined`).
- La lista de Plan Separe no mostraba el plan recién creado hasta recargar.
