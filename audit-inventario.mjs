// =====================================================================
// AUDITORÍA EN VIVO — celumaria-web-santalucia (Firebase)
// Solo lectura. No modifica nada.
//
// Cuantifica:
//  1) Doble descuento en entregas de plan separe / servicio técnico
//     (ventas con type=layaway_delivery o technical_service_payment con quantity>0).
//  2) Stock atrapado en planes separe eliminados:
//     no se puede medir post-mortem, pero medimos el "stock comprometido"
//     en planes ACTIVOS para conocer la exposición.
//  3) Stock atrapado en servicios técnicos eliminados (idem).
//  4) Cortesías en ventas eliminadas: no medible post-mortem.
//
// Además compara el `stock` actual vs el "stock teórico" reconstruido
// como: 0 + Σ compras − Σ items vendidos (regulares) − Σ items reservados
// en planes activos − Σ repuestos reservados en servicios activos
// (aprox. — los productos pueden haber sido creados con stock inicial !=0).
// =====================================================================

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyD-Bp4SeQEAmD04nVmI6CS4mwuFapqOUD8',
  authDomain: 'celumaria-web-santalucia.firebaseapp.com',
  projectId: 'celumaria-web-santalucia',
  storageBucket: 'celumaria-web-santalucia.firebasestorage.app',
  messagingSenderId: '265130593683',
  appId: '1:265130593683:web:039f9e54be9e8392f8ec66',
};

const EMAIL = 'santalucia@gmail.com';
const PASSWORD = '12345678';

const app = initializeApp(firebaseConfig, 'audit');
const db = getFirestore(app);
const auth = getAuth(app);

const fmt = (n) => Number(n).toLocaleString('es-CO');

async function safeGetDocs(name) {
  try {
    return await getDocs(collection(db, name));
  } catch (err) {
    console.warn(`   ⚠️  No se pudo leer "${name}": ${err.code || err.message}`);
    return { size: 0, forEach: () => {} };
  }
}

async function main() {
  console.log('🔐 Autenticando en celumaria-web-santalucia…');
  const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
  console.log(`✅ Autenticado uid=${cred.user.uid}`);

  try {
    const meSnap = await getDoc(doc(db, 'users', cred.user.uid));
    if (meSnap.exists()) {
      console.log(`   role: ${meSnap.data().role}\n`);
    } else {
      console.log('   (sin documento en /users)\n');
    }
  } catch (e) {
    console.log(`   (no se pudo leer /users/${cred.user.uid}: ${e.code})\n`);
  }

  // Reintenta technicalservice secuencialmente — puede dar permission-denied
  // transitorio cuando va en paralelo con la propagación del token.
  const productsSnap = await safeGetDocs('products');
  const salesSnap = await safeGetDocs('sales');
  const layawaysSnap = await safeGetDocs('layaways');
  let servicesSnap = await safeGetDocs('technicalservice');
  if (servicesSnap.size === 0) {
    // un segundo intento por si fue transitorio
    servicesSnap = await safeGetDocs('technicalservice');
  }
  // Probar variantes por si la colección real tiene otro nombre
  const altSvc1 = await safeGetDocs('technicalServices');
  const altSvc2 = await safeGetDocs('technical_services');
  const purchasesSnap = await safeGetDocs('purchases');
  const courtesiesSnap = await safeGetDocs('courtesies');

  console.log('📦 Volumen de datos:');
  console.log(`   products:                    ${productsSnap.size}`);
  console.log(`   sales:                       ${salesSnap.size}`);
  console.log(`   layaways:                    ${layawaysSnap.size}`);
  console.log(`   technicalservice:            ${servicesSnap.size}`);
  console.log(`   technicalServices (alt):     ${altSvc1.size}`);
  console.log(`   technical_services (alt):    ${altSvc2.size}`);
  console.log(`   purchases:                   ${purchasesSnap.size}`);
  console.log(`   courtesies:                  ${courtesiesSnap.size}\n`);

  // Si una variante alterna trae datos, úsala
  if (altSvc1.size > servicesSnap.size) servicesSnap = altSvc1;
  if (altSvc2.size > servicesSnap.size) servicesSnap = altSvc2;

  const products = new Map();
  productsSnap.forEach((d) => products.set(d.id, { id: d.id, ...d.data() }));

  // ───────────────────────────────────────────────────────────────────
  // 1) DOBLE DESCUENTO POR ENTREGAS REGISTRADAS COMO VENTAS
  // ───────────────────────────────────────────────────────────────────
  const dobleDescuentoPorProducto = new Map(); // productId → unidades
  let totalDoble = 0;
  let totalSalesByType = {};
  let entregasDeliveryCount = 0;
  let entregasTSPaymentCount = 0;

  salesSnap.forEach((d) => {
    const s = d.data();
    const type = s.type || 'regular';
    totalSalesByType[type] = (totalSalesByType[type] || 0) + 1;

    // El bug: salesService.add descuenta stock para CUALQUIER type si items[].quantity>0.
    // Las entregas (layaway_delivery) y abonos de tec (technical_service_payment) que
    // pasan items con quantity>0 generan doble descuento.
    if (type === 'layaway_delivery' || type === 'technical_service_payment') {
      const items = Array.isArray(s.items) ? s.items : [];
      for (const it of items) {
        const q = Number(it.quantity || 0);
        if (q > 0 && it.productId) {
          totalDoble += q;
          dobleDescuentoPorProducto.set(
            it.productId,
            (dobleDescuentoPorProducto.get(it.productId) || 0) + q,
          );
          if (type === 'layaway_delivery') entregasDeliveryCount++;
          else entregasTSPaymentCount++;
        }
      }
    }
  });

  console.log('───────────────────────────────────────────────────────────');
  console.log('1) DOBLE DESCUENTO EN ENTREGAS (causa raíz #1)');
  console.log('───────────────────────────────────────────────────────────');
  console.log('Distribución de sales por type:');
  for (const [t, n] of Object.entries(totalSalesByType).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${t.padEnd(32)} ${fmt(n)} ventas`);
  }
  console.log('');
  console.log(`Items con quantity>0 en deliveries / pagos de TS:`);
  console.log(`   layaway_delivery items contados:           ${fmt(entregasDeliveryCount)}`);
  console.log(`   technical_service_payment items contados:  ${fmt(entregasTSPaymentCount)}`);
  console.log(`   Σ unidades descontadas DOS VECES:          ${fmt(totalDoble)}`);
  console.log(`   Productos afectados:                       ${fmt(dobleDescuentoPorProducto.size)}\n`);

  if (dobleDescuentoPorProducto.size > 0) {
    const top = [...dobleDescuentoPorProducto.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    console.log('Top 15 productos más afectados (unidades de descuadre por este bug):');
    for (const [pid, units] of top) {
      const p = products.get(pid);
      const stockHoy = p ? Number(p.stock || 0) : '(producto borrado)';
      const nombre = p ? p.name : '(producto borrado)';
      console.log(`   −${String(units).padStart(5)}  stock_hoy=${String(stockHoy).padStart(5)}  ${nombre}`);
    }
    console.log('');
  }

  // ───────────────────────────────────────────────────────────────────
  // 2) STOCK COMPROMETIDO EN PLANES SEPARE ACTIVOS
  // ───────────────────────────────────────────────────────────────────
  let layawayActivos = 0;
  let layawayCompletados = 0;
  let layawayCancelados = 0;
  let layawayOtros = 0;
  let unidadesReservadasActivas = 0;
  let unidadesPendientesEnActivos = 0; // quantity - pickedUpQuantity

  layawaysSnap.forEach((d) => {
    const l = d.data();
    if (l.status === 'active') layawayActivos++;
    else if (l.status === 'completed') layawayCompletados++;
    else if (l.status === 'cancelled') layawayCancelados++;
    else layawayOtros++;

    if (l.status === 'active') {
      const items = Array.isArray(l.items) ? l.items : [];
      for (const it of items) {
        const q = Number(it.quantity || 0);
        const pu = Number(it.pickedUpQuantity || 0);
        unidadesReservadasActivas += q;
        unidadesPendientesEnActivos += Math.max(0, q - pu);
      }
    }
  });

  console.log('───────────────────────────────────────────────────────────');
  console.log('2) PLANES SEPARE');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`   active:    ${fmt(layawayActivos)}`);
  console.log(`   completed: ${fmt(layawayCompletados)}`);
  console.log(`   cancelled: ${fmt(layawayCancelados)}`);
  console.log(`   otros:     ${fmt(layawayOtros)}`);
  console.log(`   Σ unidades en planes activos (reservadas):       ${fmt(unidadesReservadasActivas)}`);
  console.log(`   Σ unidades pendientes de recoger en activos:     ${fmt(unidadesPendientesEnActivos)}\n`);

  // ───────────────────────────────────────────────────────────────────
  // 3) SERVICIOS TÉCNICOS
  // ───────────────────────────────────────────────────────────────────
  let svcActivos = 0;
  let svcCompletados = 0;
  let svcCancelados = 0;
  let svcOtros = 0;
  let unidadesRepuestoActivas = 0;
  let unidadesRepuestoConProductId = 0;

  servicesSnap.forEach((d) => {
    const s = d.data();
    if (s.status === 'active') svcActivos++;
    else if (s.status === 'completed') svcCompletados++;
    else if (s.status === 'cancelled') svcCancelados++;
    else svcOtros++;

    if (s.status === 'active') {
      const items = Array.isArray(s.items) ? s.items : [];
      for (const it of items) {
        const q = Number(it.quantity || 0);
        unidadesRepuestoActivas += q;
        if (it.productId) unidadesRepuestoConProductId += q;
      }
    }
  });

  console.log('───────────────────────────────────────────────────────────');
  console.log('3) SERVICIOS TÉCNICOS');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`   active:    ${fmt(svcActivos)}`);
  console.log(`   completed: ${fmt(svcCompletados)}`);
  console.log(`   cancelled: ${fmt(svcCancelados)}`);
  console.log(`   otros:     ${fmt(svcOtros)}`);
  console.log(`   Σ repuestos en svc activos (todos):              ${fmt(unidadesRepuestoActivas)}`);
  console.log(`   Σ repuestos en svc activos (con productId):      ${fmt(unidadesRepuestoConProductId)}`);
  console.log(`     (sólo los que tienen productId afectan stock)\n`);

  // ───────────────────────────────────────────────────────────────────
  // 4) STOCK TEÓRICO vs REAL — reconstrucción
  //    teórico = Σ compras − Σ items vendidos regulares − Σ items reservados
  //              en layaways activos/completed sin recogida total − Σ repuestos
  //              reservados en servicios activos.
  //    Nota: NO hay registro del "stock inicial al crear el producto", así que
  //    esto sólo es comparable en la VARIACIÓN, no en el absoluto. Usamos:
  //          delta = stock_real − stock_teorico_desde_movimientos
  //    Si delta es NEGATIVO ⇒ hay descuentos extra (compatible con el bug).
  // ───────────────────────────────────────────────────────────────────
  const teorico = new Map(); // productId → unidades acumuladas por movimientos

  function bump(pid, n) {
    if (!pid) return;
    teorico.set(pid, (teorico.get(pid) || 0) + n);
  }

  // Compras: +q
  let totalCompras = 0;
  purchasesSnap.forEach((d) => {
    const p = d.data();
    const items = Array.isArray(p.items) ? p.items : [];
    for (const it of items) {
      const q = Number(it.quantity || 0);
      bump(it.productId, q);
      totalCompras += q;
    }
    // Devoluciones a proveedor: −q
    const returns = Array.isArray(p.returns) ? p.returns : [];
    for (const r of returns) {
      const ritems = Array.isArray(r.items) ? r.items : [];
      for (const it of ritems) {
        const q = Number(it.returnedQuantity || 0);
        bump(it.productId, -q);
      }
    }
  });

  // Ventas regulares: −q
  // OJO: para reconstruir el "movimiento real" según la INTENCIÓN del sistema:
  //   - regular         → resta una vez (correcto)
  //   - layaway_payment → no debería restar (quantity ya es 0 en abonos)
  //   - layaway_delivery / technical_service_payment → NO deberían restar (la reserva
  //     ya restó al crear el plan). Pero el bug HACE que resten.
  // Para "stock teórico CORRECTO" no resto las entregas (ese es el espíritu del diseño).
  let totalVentasRegulares = 0;
  let totalEntregasIgnoradas = 0;
  salesSnap.forEach((d) => {
    const s = d.data();
    const type = s.type || 'regular';
    const items = Array.isArray(s.items) ? s.items : [];
    if (type === 'regular') {
      for (const it of items) {
        const q = Number(it.quantity || 0);
        bump(it.productId, -q);
        totalVentasRegulares += q;
      }
      // Cortesías de ventas regulares: −q
      const courtesy = Array.isArray(s.courtesyItems) ? s.courtesyItems : [];
      for (const it of courtesy) {
        const q = Number(it.quantity || 0);
        bump(it.productId, -q);
      }
    } else if (type === 'layaway_delivery' || type === 'technical_service_payment') {
      // entregas/abonos de TS: NO restan en el modelo correcto
      for (const it of items) {
        totalEntregasIgnoradas += Number(it.quantity || 0);
      }
    }
  });

  // Reservas activas en layaways: −(q − pickedUp)
  let unidadesReservadasNoRecogidasLayaway = 0;
  layawaysSnap.forEach((d) => {
    const l = d.data();
    if (l.status !== 'active') return;
    const items = Array.isArray(l.items) ? l.items : [];
    for (const it of items) {
      const q = Number(it.quantity || 0);
      const pu = Number(it.pickedUpQuantity || 0);
      const reservadoNoRecogido = Math.max(0, q - pu);
      bump(it.productId, -reservadoNoRecogido);
      unidadesReservadasNoRecogidasLayaway += reservadoNoRecogido;
    }
  });

  // Reservas activas en servicios técnicos: −(q − pickedUp), solo con productId
  let unidadesReservadasNoRecogidasSvc = 0;
  servicesSnap.forEach((d) => {
    const s = d.data();
    if (s.status !== 'active') return;
    const items = Array.isArray(s.items) ? s.items : [];
    for (const it of items) {
      if (!it.productId) continue;
      const q = Number(it.quantity || 0);
      const pu = Number(it.pickedUpQuantity || 0);
      const reservadoNoRecogido = Math.max(0, q - pu);
      bump(it.productId, -reservadoNoRecogido);
      unidadesReservadasNoRecogidasSvc += reservadoNoRecogido;
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // Comparar stock real vs movimientos
  // ───────────────────────────────────────────────────────────────────
  let totalStockReal = 0;
  let totalStockMovimientos = 0;
  let productosConDelta = 0;
  let sumDeltaNeg = 0;
  let sumDeltaPos = 0;
  const deltas = [];

  for (const [pid, p] of products) {
    const real = Number(p.stock || 0);
    const mov = teorico.get(pid) || 0;
    const delta = real - mov; // si negativo ⇒ stock real < lo que los movimientos justifican
    totalStockReal += real;
    totalStockMovimientos += mov;
    if (delta !== 0) productosConDelta++;
    if (delta < 0) sumDeltaNeg += delta;
    if (delta > 0) sumDeltaPos += delta;
    deltas.push({ pid, name: p.name, real, mov, delta, doble: dobleDescuentoPorProducto.get(pid) || 0 });
  }

  console.log('───────────────────────────────────────────────────────────');
  console.log('4) BALANCE GLOBAL DE MOVIMIENTOS');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`Σ compras (+):                                     ${fmt(totalCompras)}`);
  console.log(`Σ ventas regulares (−):                            ${fmt(totalVentasRegulares)}`);
  console.log(`Σ reservas no recogidas en layaways activos (−):   ${fmt(unidadesReservadasNoRecogidasLayaway)}`);
  console.log(`Σ reservas no recogidas en svc activos (−):        ${fmt(unidadesReservadasNoRecogidasSvc)}`);
  console.log(`Σ items en deliveries/abonos TS IGNORADAS:         ${fmt(totalEntregasIgnoradas)}`);
  console.log(`Σ stock REAL hoy en products:                      ${fmt(totalStockReal)}`);
  console.log(`Σ stock TEÓRICO desde movimientos:                 ${fmt(totalStockMovimientos)}`);
  console.log(`   (Δ = real − teórico)`);
  console.log(`Productos con Δ ≠ 0:                               ${fmt(productosConDelta)}`);
  console.log(`Σ Δ negativos (faltante real):                     ${fmt(sumDeltaNeg)}`);
  console.log(`Σ Δ positivos (sobrante real):                     ${fmt(sumDeltaPos)}\n`);

  console.log('   IMPORTANTE: el stock teórico parte de 0 y NO conoce el');
  console.log('   stock inicial con que se creó cada producto. Por eso NO');
  console.log('   se compara absoluto. Lo que SÍ es diagnóstico es:');
  console.log('   — productos con stock real < 0  → imposible salvo bug.');
  console.log('   — productos con  Δ ≈ −doble_descuento → confirma el bug.\n');

  const stockNegativo = deltas.filter((x) => x.real < 0);
  if (stockNegativo.length) {
    console.log(`⚠️  Productos con stock REAL NEGATIVO: ${stockNegativo.length}`);
    for (const x of stockNegativo.slice(0, 20)) {
      console.log(`     ${String(x.real).padStart(6)}  ${x.name}`);
    }
    console.log('');
  } else {
    console.log('   No hay productos con stock real negativo (lo cual es coherente:');
    console.log('   el sistema usa Math.max(0, ...) en el reducer de Redux y Firestore');
    console.log('   no rechaza valores negativos pero la UI bloquea ventas con stock=0).\n');
  }

  // Top de coincidencias entre Δ negativo y doble descuento
  const candidatos = deltas
    .filter((x) => x.doble > 0)
    .map((x) => ({ ...x, ratio: x.delta / -x.doble }))
    .sort((a, b) => a.delta - b.delta) // más negativo primero
    .slice(0, 20);

  if (candidatos.length) {
    console.log('Top 20 productos donde el Δ negativo coincide con el doble descuento:');
    console.log('   delta   doble  ratio  stock_hoy  nombre');
    for (const x of candidatos) {
      console.log(
        `   ${String(x.delta).padStart(6)}  ${String(x.doble).padStart(5)}  ${x.ratio.toFixed(2).padStart(5)}  ${String(x.real).padStart(8)}  ${x.name}`,
      );
    }
    console.log('');
    console.log('   Lectura: si "doble" explica buena parte del faltante, el bug');
    console.log('   identificado en salesService.add es el culpable principal.');
  }

  // ───────────────────────────────────────────────────────────────────
  // 5) ANOMALÍAS EN PRODUCTOS
  // ───────────────────────────────────────────────────────────────────
  let stockNeg = 0;
  let stockDecimal = 0;
  let stockMissing = 0;
  let stockMuyAlto = 0;
  let stockCero = 0;
  const decimales = [];
  const muyAltos = [];

  for (const [pid, p] of products) {
    const s = p.stock;
    if (s === undefined || s === null) {
      stockMissing++;
      continue;
    }
    if (typeof s !== 'number') {
      console.log(`   tipo inesperado en stock: ${pid} → ${typeof s} (${s})`);
      continue;
    }
    if (s < 0) stockNeg++;
    if (s === 0) stockCero++;
    if (!Number.isInteger(s)) {
      stockDecimal++;
      if (decimales.length < 10) decimales.push({ pid, s, name: p.name });
    }
    if (s > 1000) {
      stockMuyAlto++;
      if (muyAltos.length < 10) muyAltos.push({ pid, s, name: p.name });
    }
  }

  console.log('───────────────────────────────────────────────────────────');
  console.log('5) ANOMALÍAS EN products');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`   stock < 0:                ${fmt(stockNeg)}`);
  console.log(`   stock = 0:                ${fmt(stockCero)}`);
  console.log(`   stock decimal (no entero): ${fmt(stockDecimal)}`);
  console.log(`   stock null/undefined:     ${fmt(stockMissing)}`);
  console.log(`   stock > 1000:             ${fmt(stockMuyAlto)}`);

  if (decimales.length) {
    console.log('\n   Ejemplos con stock decimal (señal de bug increment con cantidad fraccionaria):');
    for (const x of decimales) console.log(`     ${x.s}  ${x.name}`);
  }
  if (muyAltos.length) {
    console.log('\n   Ejemplos con stock > 1000:');
    for (const x of muyAltos) console.log(`     ${x.s}  ${x.name}`);
  }

  // ───────────────────────────────────────────────────────────────────
  // 6) DETECCIÓN DE VENTAS DUPLICADAS (doble-clic / retry)
  // ───────────────────────────────────────────────────────────────────
  // Heurística: ventas con mismo customerId, mismo total, mismo
  // arreglo de productos, dentro de una ventana de 60 segundos.
  const salesByKey = new Map();
  let posiblesDuplicados = 0;
  const ejemplosDup = [];

  salesSnap.forEach((d) => {
    const s = d.data();
    if (s.type && s.type !== 'regular') return;
    const items = (s.items || [])
      .map((it) => `${it.productId}:${it.quantity}`)
      .sort()
      .join('|');
    const key = `${s.customerId || 'noc'}|${s.total}|${items}`;
    const arr = salesByKey.get(key) || [];
    arr.push({ id: d.id, createdAt: s.createdAt, total: s.total, items: s.items?.length || 0 });
    salesByKey.set(key, arr);
  });

  for (const [, arr] of salesByKey) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    for (let i = 1; i < arr.length; i++) {
      const dt = new Date(arr[i].createdAt) - new Date(arr[i - 1].createdAt);
      if (dt >= 0 && dt < 60_000) {
        posiblesDuplicados++;
        if (ejemplosDup.length < 10) {
          ejemplosDup.push({
            a: arr[i - 1].id,
            b: arr[i].id,
            ms: dt,
            total: arr[i].total,
          });
        }
      }
    }
  }

  console.log('\n───────────────────────────────────────────────────────────');
  console.log('6) POSIBLES VENTAS DUPLICADAS (mismo cliente+total+items en <60s)');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`   Pares sospechosos: ${fmt(posiblesDuplicados)}`);
  for (const ex of ejemplosDup) {
    console.log(`     ${ex.a} ↔ ${ex.b}   Δ=${ex.ms}ms   total=${fmt(ex.total)}`);
  }

  console.log('\n✅ Auditoría terminada.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error en la auditoría:', err);
  process.exit(1);
});
