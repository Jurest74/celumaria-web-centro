import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  runTransaction,
  getCountFromServer,
  increment,
  waitForPendingWrites
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from './collections';
import type {
  Product,
  Category,
  Sale,
  Customer,
  LayawayPlan,
  TechnicalService,
  DashboardStats,
  Purchase
} from '../../types';
import { getColombiaTimestamp, startOfDayBogota, endOfDayBogota, bogotaDateKey } from '../../utils/dateUtils';
import { agruparPedidos, faltantesDeStock, StockInsuficienteError, type Pedido } from '../../utils/stock';

// Espera confirmación del servidor con timeout de 15 segundos
function waitForServerConfirmation(): Promise<void> {
  return Promise.race([
    waitForPendingWrites(db),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('No se pudo confirmar el guardado. Verifique su conexión a internet.')), 15000)
    )
  ]);
}

// Categorías predeterminadas definidas aquí directamente
// CATEGORÍAS PREDETERMINADAS DESHABILITADAS - Celu Maria empezará con base limpia
const defaultCategories: any[] = [];

// Helper para convertir Timestamp de Firestore a string ISO
const convertTimestamp = (timestamp: any): string => {
  if (!timestamp) return getColombiaTimestamp();
  if (timestamp.toDate) return timestamp.toDate().toISOString();
  if (timestamp instanceof Date) return timestamp.toISOString();
  return timestamp || getColombiaTimestamp();
};

// Función para limpiar recursivamente todos los timestamps de un objeto
const cleanTimestamps = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => cleanTimestamps(item));
  }

  if (typeof obj === 'object') {
    // Si es un Timestamp de Firestore, convertirlo
    if (obj.toDate && typeof obj.toDate === 'function') {
      return obj.toDate().toISOString();
    }

    // Si es un objeto regular, limpiar recursivamente cada propiedad
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      cleaned[key] = cleanTimestamps(value);
    }
    return cleaned;
  }

  return obj;
};

// Función para eliminar recursivamente todos los campos con valor undefined
const removeUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item));
  }

  if (typeof obj === 'object') {
    // Preservar objetos especiales de Firestore (como serverTimestamp, FieldValue, etc.)
    if (obj.constructor && obj.constructor.name &&
        (obj.constructor.name.includes('Timestamp') ||
         obj.constructor.name.includes('FieldValue') ||
         obj.constructor.name.includes('GeoPoint'))) {
      return obj;
    }

    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Solo agregar el campo si no es undefined
      if (value !== undefined) {
        cleaned[key] = removeUndefined(value);
      }
    }
    return cleaned;
  }

  return obj;
};

// Categories Service
export const categoriesService = {
  async getAll(): Promise<Category[]> {
    try {
      console.log('🔍 Obteniendo todas las categorías...');
      const querySnapshot = await getDocs(
        query(collection(db, COLLECTIONS.CATEGORIES), orderBy('name'))
      );
      
      const categories = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: convertTimestamp(doc.data().createdAt),
        updatedAt: convertTimestamp(doc.data().updatedAt)
      })) as Category[];

      console.log(`✅ Se encontraron ${categories.length} categorías`);

      // Si no hay categorías, crear las predeterminadas
      if (categories.length === 0) {
        console.log('📝 No hay categorías, creando categorías predeterminadas...');
        // await this.createDefaultCategories(); // DESHABILITADO para Celu Maria
        // Volver a consultar después de crear las categorías
        const newSnapshot = await getDocs(
          query(collection(db, COLLECTIONS.CATEGORIES), orderBy('name'))
        );
        const newCategories = newSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: convertTimestamp(doc.data().createdAt),
          updatedAt: convertTimestamp(doc.data().updatedAt)
        })) as Category[];
        console.log(`✅ Categorías predeterminadas creadas: ${newCategories.length}`);
        return newCategories;
      }

      return categories;
    } catch (error) {
      console.error('❌ Error obteniendo categorías:', error);
      throw error;
    }
  },

  async createDefaultCategories(): Promise<void> {
    try {
      console.log('📝 Creando categorías predeterminadas...');
      const batch = writeBatch(db);
      
      defaultCategories.forEach(category => {
        const docRef = doc(collection(db, COLLECTIONS.CATEGORIES));
        batch.set(docRef, {
          ...category,
          productCount: 0,
          createdAt: getColombiaTimestamp(),
          updatedAt: getColombiaTimestamp()
        });
        console.log(`📝 Preparando categoría: ${category.name}`);
      });

      await batch.commit();
      console.log('✅ Categorías predeterminadas creadas exitosamente');
    } catch (error) {
      console.error('❌ Error creando categorías predeterminadas:', error);
      throw error;
    }
  },

  async add(category: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'productCount'>): Promise<string> {
    try {
      console.log('➕ Agregando nueva categoría:', category);
      
      // Validar datos requeridos
      if (!category.name || category.name.trim() === '') {
        throw new Error('El nombre de la categoría es requerido');
      }

      if (!category.color) {
        throw new Error('El color de la categoría es requerido');
      }

      const categoryData = {
        name: category.name.trim(),
        description: category.description?.trim() || '',
        color: category.color,
        icon: category.icon || 'Tag',
        isActive: true,
        productCount: 0,
        createdAt: getColombiaTimestamp(),
        updatedAt: getColombiaTimestamp()
      };

      console.log('📝 Datos a guardar:', categoryData);

      const docRef = await addDoc(collection(db, COLLECTIONS.CATEGORIES), categoryData);
      
      console.log('✅ Categoría agregada exitosamente con ID:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('❌ Error agregando categoría:', error);
      
      // Re-lanzar el error con más contexto
      if (error instanceof Error) {
        throw new Error(`Error al guardar categoría: ${error.message}`);
      } else {
        throw new Error('Error desconocido al guardar la categoría');
      }
    }
  },

  async update(id: string, updates: Partial<Category>): Promise<void> {
    try {
      console.log('✏️ Actualizando categoría:', id, updates);
      
      if (!id) {
        throw new Error('ID de categoría requerido para actualizar');
      }

      const categoryRef = doc(db, COLLECTIONS.CATEGORIES, id);
      
      // Verificar que la categoría existe
      const categoryDoc = await getDoc(categoryRef);
      if (!categoryDoc.exists()) {
        throw new Error('La categoría no existe');
      }

      // Verificar si es la categoría "Celulares" y se está intentando cambiar el nombre
      const currentCategoryData = categoryDoc.data();
      if (currentCategoryData?.name?.toLowerCase() === 'celulares' && 
          updates.name && updates.name.toLowerCase() !== 'celulares') {
        throw new Error('No se puede modificar el nombre de la categoría "Celulares" ya que es una categoría esencial del sistema');
      }

      const updateData = {
        ...updates,
        updatedAt: getColombiaTimestamp()
      };

      await updateDoc(categoryRef, updateData);
      console.log('✅ Categoría actualizada exitosamente:', id);
    } catch (error) {
      console.error('❌ Error actualizando categoría:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    try {
      console.log('🗑️ Eliminando categoría:', id);
      
      if (!id) {
        throw new Error('ID de categoría requerido para eliminar');
      }

      const categoryRef = doc(db, COLLECTIONS.CATEGORIES, id);
      
      // Verificar que la categoría existe
      const categoryDoc = await getDoc(categoryRef);
      if (!categoryDoc.exists()) {
        throw new Error('La categoría no existe');
      }

      // Verificar si la categoría es "Celulares" (protegida)
      const categoryData = categoryDoc.data();
      if (categoryData?.name?.toLowerCase() === 'celulares') {
        throw new Error('No se puede eliminar la categoría "Celulares" ya que es una categoría esencial del sistema');
      }

      await deleteDoc(categoryRef);
      console.log('✅ Categoría eliminada exitosamente:', id);
    } catch (error) {
      console.error('❌ Error eliminando categoría:', error);
      throw error;
    }
  },

  subscribe(callback: (categories: Category[]) => void) {
    console.log('🔄 Iniciando suscripción a categorías...');
    return onSnapshot(
      query(collection(db, COLLECTIONS.CATEGORIES), orderBy('name')),
      (snapshot) => {
        console.log(`🔄 Actualización de categorías recibida: ${snapshot.docs.length} categorías`);
        const categories = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: convertTimestamp(doc.data().createdAt),
          updatedAt: convertTimestamp(doc.data().updatedAt)
        })) as Category[];
        callback(categories);
      },
      (error) => {
        console.error('❌ Error en suscripción de categorías:', error);
      }
    );
  }
};

// Products Service
/**
 * Conteos del inventario sin traer los productos.
 *
 * La pantalla de Inventario pagina la lista, pero calculaba sus cifras
 * llamando a productsService.getAll(): leia la coleccion entera en cada visita
 * y otra vez despues de crear, editar o eliminar cada producto, asi que la
 * paginacion no ahorraba nada. Con un catalogo grande eso es lo que dispara la
 * cuota de Firestore.
 *
 * getCountFromServer resuelve el conteo en el servidor y no devuelve ningun
 * documento. El rango de stock usa un solo campo, asi que no exige indice
 * compuesto.
 */
export async function conteosInventario(umbralStockBajo = 5): Promise<{
  total: number;
  sinStock: number;
  stockBajo: number;
}> {
  const productos = collection(db, COLLECTIONS.PRODUCTS);

  const [total, sinStock, stockBajo] = await Promise.all([
    getCountFromServer(productos),
    getCountFromServer(query(productos, where('stock', '==', 0))),
    getCountFromServer(query(productos, where('stock', '>', 0), where('stock', '<=', umbralStockBajo)))
  ]);

  return {
    total: total.data().count,
    sinStock: sinStock.data().count,
    stockBajo: stockBajo.data().count
  };
}

export const productsService = {
  // Get all products
  async getAll(): Promise<Product[]> {
    const querySnapshot = await getDocs(
      query(collection(db, COLLECTIONS.PRODUCTS), orderBy('createdAt', 'desc'))
    );
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: convertTimestamp(doc.data().createdAt),
      updatedAt: convertTimestamp(doc.data().updatedAt)
    })) as Product[];
  },

  // Add product
  async add(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const batch = writeBatch(db);
    
    // Add product
    const productRef = doc(collection(db, COLLECTIONS.PRODUCTS));
    batch.set(productRef, {
      ...product,
      createdAt: getColombiaTimestamp(),
      updatedAt: getColombiaTimestamp()
    });
    
    // Update category product count
    if (product.categoryId) {
      const categoryRef = doc(db, COLLECTIONS.CATEGORIES, product.categoryId);
      batch.update(categoryRef, {
        productCount: increment(1),
        updatedAt: getColombiaTimestamp()
      });
    }
    
    await batch.commit();
    await waitForServerConfirmation();
    return productRef.id;
  },

  // Update product
  async update(id: string, updates: Partial<Product>): Promise<void> {
    const productRef = doc(db, COLLECTIONS.PRODUCTS, id);
    
    // Get current product to check category change
    const currentProduct = await getDoc(productRef);
    const currentData = currentProduct.data() as Product;
    
    const batch = writeBatch(db);
    
    // Update product
    batch.update(productRef, {
      ...updates,
      updatedAt: getColombiaTimestamp()
    });

    // Update category counts if category changed
    if (updates.categoryId && currentData.categoryId !== updates.categoryId) {
      if (currentData.categoryId) {
        const oldCategoryRef = doc(db, COLLECTIONS.CATEGORIES, currentData.categoryId);
        batch.update(oldCategoryRef, {
          productCount: increment(-1),
          updatedAt: getColombiaTimestamp()
        });
      }
      const newCategoryRef = doc(db, COLLECTIONS.CATEGORIES, updates.categoryId);
      batch.update(newCategoryRef, {
        productCount: increment(1),
        updatedAt: getColombiaTimestamp()
      });
    }
    
    await batch.commit();
  },

  // Delete product
  async delete(id: string): Promise<void> {
    const productRef = doc(db, COLLECTIONS.PRODUCTS, id);
    const productDoc = await getDoc(productRef);
    const productData = productDoc.data() as Product;
    
    const batch = writeBatch(db);
    
    // Delete product
    batch.delete(productRef);
    
    // Update category count
    if (productData.categoryId) {
      const categoryRef = doc(db, COLLECTIONS.CATEGORIES, productData.categoryId);
      batch.update(categoryRef, {
        productCount: increment(-1),
        updatedAt: getColombiaTimestamp()
      });
    }
    
    await batch.commit();
  },

  /**
   * Fija el stock de un producto a un conteo manual, solo si nadie lo movió
   * desde que se abrió el formulario.
   *
   * Antes editar un producto escribía siempre el stock que mostraba el
   * formulario, aunque solo se cambiara el precio: una venta hecha mientras
   * el formulario estaba abierto desaparecía del inventario, y como el valor
   * "no cambiaba" tampoco quedaba registro en la auditoría.
   *
   * Devuelve el stock que había justo antes del ajuste.
   */
  async ajustarStock(productId: string, stockEsperado: number, stockNuevo: number): Promise<number> {
    const productRef = doc(db, COLLECTIONS.PRODUCTS, productId);
    const anterior = await runTransaction(db, async (tx) => {
      const snap = await tx.get(productRef);
      if (!snap.exists()) {
        throw new Error('El producto ya no existe.');
      }
      const actual = Number(snap.data().stock || 0);
      if (actual !== stockEsperado) {
        throw new Error(
          `El stock de este producto cambió mientras lo editabas (ahora hay ${actual}, ` +
          'probablemente por una venta). No se guardó nada: cierra el formulario, ábrelo de nuevo y revisa el conteo.'
        );
      }
      tx.update(productRef, {
        stock: stockNuevo,
        updatedAt: getColombiaTimestamp()
      });
      return actual;
    });
    await waitForServerConfirmation();
    return anterior;
  },

  // Update stock
  async updateStock(productId: string, quantityChange: number): Promise<void> {
    console.log(`📦 Actualizando stock del producto ${productId}: cambio de ${quantityChange}`);
    
    const productRef = doc(db, COLLECTIONS.PRODUCTS, productId);
    
    // Get current product to log the change
    const productDoc = await getDoc(productRef);
    if (productDoc.exists()) {
      const currentData = productDoc.data() as Product;
      console.log(`📦 Stock actual: ${currentData.stock}, nuevo stock: ${currentData.stock + quantityChange}`);
    }
    
    await updateDoc(productRef, {
      stock: increment(quantityChange),
      updatedAt: getColombiaTimestamp()
    });
    
    console.log(`✅ Stock actualizado exitosamente para producto ${productId}`);
  },

  // Subscribe to real-time updates
  subscribe(callback: (products: Product[]) => void) {
    return onSnapshot(
      query(collection(db, COLLECTIONS.PRODUCTS), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const products = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: convertTimestamp(doc.data().createdAt),
          updatedAt: convertTimestamp(doc.data().updatedAt)
        })) as Product[];
        callback(products);
      },
      (error) => {
        // Sin este callback un fallo de lectura se veria como lista vacia.
        console.error('Error escuchando productos:', error);
      }
    );
  }
};

// Sales Service
/**
 * Descuenta existencias verificandolas contra el dato fresco, dentro de una
 * transaccion. Firestore reintenta la transaccion si otro proceso toco los
 * mismos productos entre la lectura y la escritura, asi que dos cajas
 * vendiendo la ultima unidad no pueden pasar las dos.
 *
 * `escribirDocumento` recibe la transaccion para guardar el documento que
 * motiva la reserva (la venta, el plan separe, el servicio tecnico) en el
 * mismo commit: o quedan el documento y el descuento, o no queda ninguno.
 *
 * Lanza StockInsuficienteError con el detalle de lo que falto.
 */
/**
 * MODO CONTINGENCIA — poner en false SOLO mientras las lecturas de Firestore
 * esten bloqueadas (error "Quota exceeded"), y volver a true apenas se
 * normalice.
 *
 * Con false la venta no relee el stock en el servidor: solo lo descuenta. Se
 * mantiene la verificacion contra el stock que muestra la pantalla, asi que se
 * puede sobrevender si dos cajas venden la ultima unidad al mismo tiempo o si
 * la pantalla trae datos viejos, y el stock puede quedar en negativo. Es
 * recuperable con un ajuste de inventario.
 */
export const VERIFICAR_STOCK_EN_SERVIDOR = true;

async function reservarExistencias(
  pedidos: Pedido[],
  escribirDocumento?: (tx: Parameters<Parameters<typeof runTransaction>[1]>[0]) => void
): Promise<void> {
  const porProducto = agruparPedidos(pedidos);

  if (!VERIFICAR_STOCK_EN_SERVIDOR) {
    // Sin lecturas: un solo batch con el documento y los descuentos.
    const batch = writeBatch(db);
    escribirDocumento?.(batch as unknown as Parameters<Parameters<typeof runTransaction>[1]>[0]);
    for (const [productId, { total }] of porProducto) {
      batch.update(doc(db, COLLECTIONS.PRODUCTS, productId), {
        stock: increment(-total),
        updatedAt: getColombiaTimestamp()
      });
    }
    await batch.commit();
    return;
  }

  await runTransaction(db, async (tx) => {
    // Firestore exige que todas las lecturas ocurran antes de cualquier escritura.
    const existencias = new Map<string, number | null>();
    for (const productId of porProducto.keys()) {
      const snap = await tx.get(doc(db, COLLECTIONS.PRODUCTS, productId));
      existencias.set(productId, snap.exists() ? ((snap.data() as any).stock ?? 0) : null);
    }

    const faltantes = faltantesDeStock(porProducto, existencias);
    if (faltantes.length > 0) {
      throw new StockInsuficienteError(faltantes);
    }

    escribirDocumento?.(tx);

    for (const [productId, { total }] of porProducto) {
      tx.update(doc(db, COLLECTIONS.PRODUCTS, productId), {
        stock: increment(-total),
        updatedAt: getColombiaTimestamp()
      });
    }
  });
}

/**
 * Lee un plan separe o un servicio tecnico dentro de una transaccion, deja que
 * `construir` calcule los cambios sobre ese dato fresco y escribe todo en un
 * solo commit: el documento, las ventas contables que se crean o se borran y
 * los movimientos de stock.
 *
 * Las pantallas de Plan Separe y Servicio Tecnico no escuchan cambios en vivo.
 * Antes cada accion tomaba el documento que tenia en memoria, le hacia el
 * cambio y reescribia arreglos completos (`payments`, `items`): un segundo
 * equipo con la pantalla abierta desde antes borraba lo que el primero acababa
 * de guardar. Y lo que acompanaba al cambio (la venta del abono, la entrega,
 * el stock) se guardaba aparte, a veces tragandose el error.
 *
 * `construir` puede ejecutarse mas de una vez si Firestore reintenta la
 * transaccion, asi que no debe tener efectos por fuera de lo que devuelve.
 *
 * Las ventas que se crean o borran aqui son registros contables (abonos,
 * entregas, devoluciones): no mueven stock, igual que en salesService.add.
 * Un movimiento de stock sobre un producto que ya no existe se omite.
 */
export interface CambiosEnTransaccion<R> {
  cambios: Record<string, unknown>;
  ventas?: Record<string, unknown>[];
  ventasABorrar?: string[];
  stock?: { productId: string; cambio: number }[];
  resultado: R;
}

export async function actualizarEnTransaccion<T, R>(
  coleccion: typeof COLLECTIONS.LAYAWAYS | typeof COLLECTIONS.TECHNICAL_SERVICES,
  id: string,
  construir: (actual: T) => CambiosEnTransaccion<R>
): Promise<R> {
  const ref = doc(db, coleccion, id);

  const resultado = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error(
        coleccion === COLLECTIONS.LAYAWAYS
          ? 'No se encontró el plan separe. Puede que lo hayan eliminado desde otro equipo.'
          : 'No se encontró el servicio técnico. Puede que lo hayan eliminado desde otro equipo.'
      );
    }

    const actual = { id: snap.id, ...cleanTimestamps(snap.data()) } as T;
    const { cambios, ventas = [], ventasABorrar = [], stock = [], resultado } = construir(actual);

    // Firestore exige que todas las lecturas ocurran antes de cualquier escritura.
    const productosExistentes = new Set<string>();
    for (const { productId } of stock) {
      if (!productId || productosExistentes.has(productId)) continue;
      const productoSnap = await tx.get(doc(db, COLLECTIONS.PRODUCTS, productId));
      if (productoSnap.exists()) productosExistentes.add(productId);
    }

    for (const venta of ventas) {
      const tipo = venta.type;
      if (!tipo || tipo === 'regular') {
        throw new Error('actualizarEnTransaccion solo crea registros contables, no ventas que descuenten stock');
      }
      tx.set(doc(collection(db, COLLECTIONS.SALES)), removeUndefined({
        ...venta,
        createdAt: getColombiaTimestamp()
      }));
    }

    for (const ventaId of ventasABorrar) {
      tx.delete(doc(db, COLLECTIONS.SALES, ventaId));
    }

    for (const { productId, cambio } of stock) {
      if (!productosExistentes.has(productId) || !cambio) continue;
      tx.update(doc(db, COLLECTIONS.PRODUCTS, productId), {
        stock: increment(cambio),
        updatedAt: getColombiaTimestamp()
      });
    }

    tx.update(ref, removeUndefined({
      ...cambios,
      updatedAt: getColombiaTimestamp()
    }));

    return resultado;
  });

  await waitForServerConfirmation();
  return resultado;
}

/**
 * Registra un pago sobre un plan separe o un servicio tecnico junto con sus
 * registros en ventas (ver actualizarEnTransaccion).
 */
export async function registrarPago<T, R>(
  coleccion: typeof COLLECTIONS.LAYAWAYS | typeof COLLECTIONS.TECHNICAL_SERVICES,
  id: string,
  construir: (actual: T) => {
    cambios: Record<string, unknown>;
    ventas: Record<string, unknown>[];
    resultado: R;
  }
): Promise<R> {
  return actualizarEnTransaccion(coleccion, id, construir);
}

/**
 * Busca la venta contable que corresponde a un pago de plan separe o de
 * servicio tecnico. La venta no guarda el id del pago, asi que se busca por
 * documento de origen, tipo y monto; si hay varias con el mismo monto se
 * toma la registrada mas cerca de la fecha del pago.
 *
 * Antes se descargaba la coleccion completa de ventas para buscarla.
 */
export async function buscarVentaDePago(
  origen: { layawayId: string } | { technicalServiceId: string },
  pago: { amount: number; paymentDate?: string }
): Promise<string | null> {
  const [campo, valor, tipo] = 'layawayId' in origen
    ? ['layawayId', origen.layawayId, 'layaway_payment']
    : ['technicalServiceId', origen.technicalServiceId, 'technical_service_payment'];

  const snap = await getDocs(query(collection(db, COLLECTIONS.SALES), where(campo, '==', valor)));
  const candidatas = snap.docs
    .map(d => ({ id: d.id, ...(cleanTimestamps(d.data()) as { type?: string; total?: number; createdAt?: string; isLayaway?: boolean }) }))
    .filter(v =>
      v.total === pago.amount &&
      (v.type === tipo || (tipo === 'layaway_payment' && !v.type && v.isLayaway))
    );

  if (candidatas.length === 0) return null;
  if (candidatas.length === 1 || !pago.paymentDate) return candidatas[0].id;

  const fechaPago = new Date(pago.paymentDate).getTime();
  const distancia = (v: { createdAt?: string }) =>
    Math.abs((v.createdAt ? new Date(v.createdAt).getTime() : 0) - fechaPago);
  return candidatas.sort((a, b) => distancia(a) - distancia(b))[0].id;
}

/**
 * Busca los registros de entrega (ventas 'layaway_delivery') que corresponden
 * a recogidas de un plan separe.
 *
 * Al revertir una recogida, o al cancelar el pago que habia completado el
 * plan, la recogida desaparece pero su registro de entrega quedaba: al volver
 * a recoger se creaba otro y la ganancia se contaba dos veces.
 *
 * Las entregas nuevas guardan `pickupId`. Las anteriores se reconocen por
 * producto, cantidad y una fecha a menos de 5 minutos de la recogida; si hay
 * mas de una posible, no se toma ninguna.
 */
export async function buscarVentasDeEntrega(
  layawayId: string,
  recogidas: { pickupId: string; productId: string; quantity: number; date: string }[]
): Promise<{ ventaPorRecogida: Record<string, string>; sinIdentificar: number }> {
  if (recogidas.length === 0) return { ventaPorRecogida: {}, sinIdentificar: 0 };

  const snap = await getDocs(query(collection(db, COLLECTIONS.SALES), where('layawayId', '==', layawayId)));
  const entregas = snap.docs
    .map(d => ({ id: d.id, ...(cleanTimestamps(d.data()) as {
      type?: string;
      pickupId?: string;
      createdAt?: string;
      items?: { productId?: string; quantity?: number }[];
    }) }))
    .filter(v => v.type === 'layaway_delivery');

  const usadas = new Set<string>();
  const ventaPorRecogida: Record<string, string> = {};
  let sinIdentificar = 0;

  for (const recogida of recogidas) {
    let venta = entregas.find(v => v.pickupId === recogida.pickupId && !usadas.has(v.id));
    if (!venta) {
      const fecha = new Date(recogida.date).getTime();
      const posibles = entregas.filter(v =>
        !v.pickupId &&
        !usadas.has(v.id) &&
        v.items?.[0]?.productId === recogida.productId &&
        v.items?.[0]?.quantity === recogida.quantity &&
        v.createdAt !== undefined &&
        Math.abs(new Date(v.createdAt).getTime() - fecha) < 5 * 60 * 1000
      );
      venta = posibles.length === 1 ? posibles[0] : undefined;
    }

    if (venta) {
      usadas.add(venta.id);
      ventaPorRecogida[recogida.pickupId] = venta.id;
    } else {
      sinIdentificar++;
    }
  }

  return { ventaPorRecogida, sinIdentificar };
}

export const salesService = {
  async getAll(): Promise<Sale[]> {
    const querySnapshot = await getDocs(
      query(collection(db, COLLECTIONS.SALES), orderBy('createdAt', 'desc'))
    );
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      // Limpiar todos los timestamps recursivamente
      const cleanedData = cleanTimestamps(data);
      return {
        id: doc.id,
        ...cleanedData
      };
    }) as Sale[];
  },

  /**
   * Ventas desde una fecha. El Panel de Control y el filtro de clientes solo
   * necesitan un periodo reciente: traer la coleccion entera cuesta una lectura
   * por venta del historico cada vez que se abre la pantalla.
   */
  async getSince(startISO: string): Promise<Sale[]> {
    const querySnapshot = await getDocs(query(
      collection(db, COLLECTIONS.SALES),
      where('createdAt', '>=', startISO),
      orderBy('createdAt', 'desc')
    ));
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...cleanTimestamps(doc.data())
    })) as Sale[];
  },

  async add(sale: Omit<Sale, 'id' | 'createdAt'>): Promise<string> {
    const saleRef = doc(collection(db, COLLECTIONS.SALES));
    const cleanedSale = removeUndefined({
      ...sale,
      createdAt: getColombiaTimestamp()
    });

    // El stock SOLO se descuenta para ventas regulares.
    // Las ventas de tipo:
    //   - 'layaway_payment' / 'layaway_delivery' → el stock ya se descontó al
    //     crear el plan separe (layawaysService.add)
    //   - 'technical_service_payment' → el stock ya se descontó al crear el
    //     servicio (technicalServicesService.add)
    // Estos registros existen únicamente como histórico contable.
    const affectsStock = !sale.type || sale.type === 'regular';

    if (!affectsStock) {
      await setDoc(saleRef, cleanedSale);
      await waitForServerConfirmation();
      return saleRef.id;
    }

    // Las cortesías salen del mismo inventario que lo vendido, así que entran
    // en la misma verificación: un producto puede ir en una línea de venta y
    // además como cortesía, y por separado ninguna de las dos alcanzaría a
    // detectar que juntas no caben.
    const pedidos: Pedido[] = [
      ...sale.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        productName: (item as any).productName
      })),
      ...((sale.courtesyItems || []) as any[]).map(c => ({
        productId: c.productId,
        quantity: c.quantity,
        productName: c.productName
      }))
    ];

    await reservarExistencias(pedidos, (tx) => tx.set(saleRef, cleanedSale));
    await waitForServerConfirmation();
    return saleRef.id;
  },

  async update(id: string, updates: Partial<Sale>): Promise<void> {
    const saleRef = doc(db, COLLECTIONS.SALES, id);
    await updateDoc(saleRef, {
      ...updates,
      updatedAt: getColombiaTimestamp()
    });
  },

  /**
   * Elimina una venta y, si descontó stock, lo devuelve. Todo en una
   * transaccion.
   *
   * Antes se leia la venta y se armaba un batch aparte: si dos personas
   * borraban la misma venta al tiempo, las dos alcanzaban a leerla y las dos
   * devolvian el stock. Dentro de la transaccion la segunda ve que la venta ya
   * no existe y no hace nada.
   */
  async delete(id: string): Promise<void> {
    const saleRef = doc(db, COLLECTIONS.SALES, id);

    // Las cortesias asociadas se buscan antes (una consulta no puede ir dentro
    // de la transaccion) y se borran en el mismo commit. Tolerante a fallo de
    // permisos.
    let cortesiaIds: string[] = [];
    try {
      const courtesyDocs = await getDocs(query(
        collection(db, COLLECTIONS.COURTESIES),
        where('saleId', '==', id)
      ));
      cortesiaIds = courtesyDocs.docs.map(d => d.id);
    } catch (err) {
      console.warn('No se pudieron buscar cortesías asociadas a la venta:', err);
    }

    await runTransaction(db, async (tx) => {
      const saleDoc = await tx.get(saleRef);
      if (!saleDoc.exists()) {
        throw new Error('Venta no encontrada. Puede que ya la hayan eliminado desde otro equipo.');
      }

      const saleData = saleDoc.data() as Sale;

      // Solo restaurar stock si esta venta lo descontó al crearse — debe ser
      // simétrico a salesService.add. Las ventas tipo layaway_*/technical_service_*
      // son sólo registros contables y nunca tocaron stock.
      const affectedStock = !saleData.type || saleData.type === 'regular';
      const porProducto = new Map<string, number>();
      if (affectedStock) {
        const lineas = [...(saleData.items || []), ...(saleData.courtesyItems || [])];
        for (const linea of lineas) {
          if (!linea.productId || !linea.quantity) continue;
          porProducto.set(linea.productId, (porProducto.get(linea.productId) || 0) + linea.quantity);
        }
      }

      // Todas las lecturas antes de escribir. Si el producto ya no existe se
      // omite la devolución de su stock.
      const existentes: string[] = [];
      for (const productId of porProducto.keys()) {
        const productDoc = await tx.get(doc(db, COLLECTIONS.PRODUCTS, productId));
        if (productDoc.exists()) existentes.push(productId);
      }

      tx.delete(saleRef);
      for (const productId of existentes) {
        tx.update(doc(db, COLLECTIONS.PRODUCTS, productId), {
          stock: increment(porProducto.get(productId) || 0),
          updatedAt: getColombiaTimestamp()
        });
      }
      for (const cortesiaId of cortesiaIds) {
        tx.delete(doc(db, COLLECTIONS.COURTESIES, cortesiaId));
      }
    });

    await waitForServerConfirmation();
  },

  subscribe(callback: (sales: Sale[]) => void) {
    return onSnapshot(
      query(collection(db, COLLECTIONS.SALES), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const sales = snapshot.docs.map(doc => {
          const data = doc.data();
          const cleanedData = cleanTimestamps(data);
          return {
            id: doc.id,
            ...cleanedData
          };
        }) as Sale[];
        callback(sales);
      },
      (error) => {
        // Sin este callback un fallo de lectura se veria como lista vacia.
        console.error('Error escuchando ventas:', error);
      }
    );
  },

  /**
   * Ventas del día de un vendedor, en vivo.
   *
   * Se consulta solo por fecha (un rango sobre un único campo no necesita
   * índice compuesto) y el vendedor se filtra en el cliente, cubriendo las
   * ventas con salesPersonId y las antiguas que solo guardan el email en
   * salesPersonName. Antes la consulta de esta sede exigía un índice
   * salesPersonId + createdAt que no está en firestore.indexes.json: si
   * faltaba, el error se convertía en una lista vacía y el vendedor veía
   * "0 ventas" sin ningún aviso. Ahora el error llega a `onError`.
   */
  subscribeTodaySalesBySalesperson(
    salesPersonId: string,
    salesPersonEmail: string,
    callback: (sales: Sale[]) => void,
    onError?: (error: Error) => void
  ) {
    // Rango del día calendario Colombia (independiente de la TZ del navegador).
    const todayStartISO = startOfDayBogota();
    const todayEndISO = endOfDayBogota();

    const q = query(
      collection(db, COLLECTIONS.SALES),
      where('createdAt', '>=', todayStartISO),
      where('createdAt', '<=', todayEndISO),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q,
      (snapshot) => {
        const allTodaySales = snapshot.docs.map(doc => {
          const data = doc.data();
          const cleanedData = cleanTimestamps(data);
          return { id: doc.id, ...cleanedData };
        }) as Sale[];

        const todaySales = allTodaySales.filter(sale =>
          (salesPersonId && sale.salesPersonId === salesPersonId) ||
          (salesPersonEmail && sale.salesPersonName === salesPersonEmail)
        );

        callback(todaySales);
      },
      (error) => {
        console.error('❌ Error en suscripción de ventas del día:', error);
        onError?.(error);
      }
    );
  }
};

// Customers Service
/**
 * Compromisos vivos de un cliente: planes separe y servicios tecnicos que no
 * estan cerrados. Se consulta Firestore en el momento, no el store de Redux:
 * al entrar a la pantalla de Clientes solo se cargan clientes, asi que
 * cualquier verificacion contra el store leeria un arreglo vacio y dejaria
 * pasar el borrado.
 *
 * Se filtra por customerId (un solo filtro de igualdad, sin indice compuesto)
 * y el estado se descarta en memoria.
 */
export async function compromisosActivosDeCliente(customerId: string): Promise<{
  planesSepare: number;
  serviciosTecnicos: number;
}> {
  const vivos = (docs: any[], cerrados: string[]) =>
    docs.filter(d => !cerrados.includes((d.data() as any).status)).length;

  const [layaways, servicios] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.LAYAWAYS), where('customerId', '==', customerId))),
    getDocs(query(collection(db, COLLECTIONS.TECHNICAL_SERVICES), where('customerId', '==', customerId)))
  ]);

  return {
    planesSepare: vivos(layaways.docs, ['completed', 'cancelled']),
    serviciosTecnicos: vivos(servicios.docs, ['completed', 'cancelled', 'delivered'])
  };
}

export const customersService = {
  async getAll(): Promise<Customer[]> {
    const querySnapshot = await getDocs(
      query(collection(db, COLLECTIONS.CUSTOMERS), orderBy('name'))
    );
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: convertTimestamp(doc.data().createdAt),
      updatedAt: convertTimestamp(doc.data().updatedAt)
    })) as Customer[];
  },

  async add(customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTIONS.CUSTOMERS), {
      ...customer,
      credit: 0, // Saldo a favor inicial
      createdAt: getColombiaTimestamp(),
      updatedAt: getColombiaTimestamp()
    });
    return docRef.id;
  },

  async update(id: string, updates: Partial<Customer>): Promise<void> {
    const customerRef = doc(db, COLLECTIONS.CUSTOMERS, id);
    await updateDoc(customerRef, {
      ...updates,
      updatedAt: getColombiaTimestamp()
    });
  },

  /**
   * Descuenta saldo a favor verificandolo contra el dato fresco.
   *
   * Antes se escribia `credit: customer.credit - usado` con el cliente que
   * estaba en memoria: dos cobros al mismo cliente (dos cajas, o una pantalla
   * abierta desde antes) partian del mismo saldo y el segundo sobrescribia al
   * primero, asi que el saldo se gastaba dos veces.
   */
  async useCredit(id: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    const customerRef = doc(db, COLLECTIONS.CUSTOMERS, id);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(customerRef);
      if (!snap.exists()) {
        throw new Error('Cliente no encontrado');
      }
      const disponible: number = snap.data().credit || 0;
      if (disponible + 0.01 < amount) {
        throw new Error(`Saldo a favor insuficiente: se piden ${amount}, hay ${disponible}`);
      }
      tx.update(customerRef, {
        credit: Math.max(0, disponible - amount),
        updatedAt: getColombiaTimestamp()
      });
    });
  },

  // Suma saldo a favor sin partir de una lectura previa.
  async addCredit(id: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    await updateDoc(doc(db, COLLECTIONS.CUSTOMERS, id), {
      credit: increment(amount),
      updatedAt: getColombiaTimestamp()
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTIONS.CUSTOMERS, id));
  },

  subscribe(callback: (customers: Customer[]) => void) {
    return onSnapshot(
      query(collection(db, COLLECTIONS.CUSTOMERS), orderBy('name')),
      (snapshot) => {
        const customers = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: convertTimestamp(doc.data().createdAt),
          updatedAt: convertTimestamp(doc.data().updatedAt)
        })) as Customer[];
        callback(customers);
      },
      (error) => {
        // Sin este callback un fallo de lectura se veria como lista vacia.
        console.error('Error escuchando clientes:', error);
      }
    );
  }
};

// Layaways Service - SIMPLIFICADO SIN ÍNDICES COMPLEJOS
export const layawaysService = {
  // Obtener todos los planes separe y filtrar en el cliente
  async getAll(): Promise<LayawayPlan[]> {
    console.log('🔍 Obteniendo todos los planes separe...');
    try {
      // Consulta simple sin filtros complejos
      const querySnapshot = await getDocs(collection(db, COLLECTIONS.LAYAWAYS));
      
      const layaways = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: convertTimestamp(doc.data().createdAt),
        updatedAt: convertTimestamp(doc.data().updatedAt)
      })) as LayawayPlan[];

      console.log(`✅ Se encontraron ${layaways.length} planes separe en total`);
      return layaways;
    } catch (error) {
      console.error('❌ Error obteniendo planes separe:', error);
      throw error;
    }
  },

  // Un solo plan separe. Refrescar uno cuesta una lectura, no toda la coleccion.
  async getById(id: string): Promise<LayawayPlan | null> {
    const snap = await getDoc(doc(db, COLLECTIONS.LAYAWAYS, id));
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...snap.data(),
      createdAt: convertTimestamp(snap.data().createdAt),
      updatedAt: convertTimestamp(snap.data().updatedAt)
    } as LayawayPlan;
  },

  // Obtener solo activos (filtrado en el cliente)
  async getActiveLayaways(): Promise<LayawayPlan[]> {
    console.log('🔍 Obteniendo planes separe activos...');
    try {
      // Obtener todos y filtrar en el cliente para evitar índices
      const allLayaways = await this.getAll();
      const activeLayaways = allLayaways.filter(layaway => layaway.status === 'active');
      
      console.log(`✅ Se encontraron ${activeLayaways.length} planes separe activos de ${allLayaways.length} totales`);
      return activeLayaways;
    } catch (error) {
      console.error('❌ Error obteniendo planes separe activos:', error);
      throw error;
    }
  },

  async add(layaway: Omit<LayawayPlan, 'id' | 'createdAt' | 'updatedAt' | 'payments' | 'remainingBalance'>): Promise<string> {
    console.log('🛒 Creando plan separe con actualización de inventario...', layaway);
    
    const layawayRef = doc(collection(db, COLLECTIONS.LAYAWAYS));
    // removeUndefined: los clientes sin correo o teléfono no traen esos campos,
    // y la pantalla arma el plan con customerEmail: customer.email. Firestore
    // rechaza un campo undefined dentro de la transacción, así que el plan no
    // se podía crear para ningún cliente sin correo.
    const layawayData = removeUndefined({
      ...layaway,
      payments: layaway.downPayment > 0 ? [{
        id: crypto.randomUUID(),
        amount: layaway.downPayment,
        paymentDate: getColombiaTimestamp(),
        paymentMethod: 'cash',
        notes: 'Pago inicial'
      }] : [],
      remainingBalance: layaway.totalAmount - layaway.downPayment,
      createdAt: getColombiaTimestamp(),
      updatedAt: getColombiaTimestamp()
    });
    
    // El plan separe y la reserva del inventario van en la misma transaccion:
    // si no hay existencias no queda ni el plan ni el descuento.
    console.log('📦 Reservando inventario para el plan separe...');
    await reservarExistencias(
      layaway.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        productName: item.productName
      })),
      (tx) => tx.set(layawayRef, layawayData)
    );
    await waitForServerConfirmation();
    console.log('✅ Plan separe creado e inventario actualizado exitosamente');
    return layawayRef.id;
  },

  /**
   * Cancela un plan separe: marca el estado, devuelve al inventario las
   * unidades no recogidas y acredita al cliente el dinero que no corresponde
   * a producto entregado. Todo en una transaccion.
   *
   * Antes esto ocurria en tres pasos sueltos desde el componente, y en este
   * orden: devolver stock, acreditar saldo, marcar cancelado. Si el ultimo
   * paso fallaba, el plan seguia activo con el stock ya devuelto, y el
   * reintento lo devolvia otra vez; un doble clic hacia lo mismo. Releer el
   * estado dentro de la transaccion hace que la segunda pasada no haga nada.
   */
  async cancel(layawayId: string): Promise<{
    yaCancelado: boolean;
    unidadesDevueltas: number;
    saldoAcreditado: number;
  }> {
    return runTransaction(db, async (tx) => {
      const layawayRef = doc(db, COLLECTIONS.LAYAWAYS, layawayId);
      const snap = await tx.get(layawayRef);
      if (!snap.exists()) {
        throw new Error('Plan separe no encontrado');
      }

      const plan = snap.data() as LayawayPlan;
      if (plan.status === 'cancelled') {
        return { yaCancelado: true, unidadesDevueltas: 0, saldoAcreditado: 0 };
      }

      const porDevolver = (plan.items || [])
        .map(item => ({
          productId: item.productId,
          cantidad: item.quantity - (item.pickedUpQuantity || 0)
        }))
        .filter(x => x.productId && x.cantidad > 0);

      const totalPagado = (plan.payments || []).reduce((sum, pago) => sum + pago.amount, 0);
      const valorRecogido = (plan.items || []).reduce(
        (sum, item) => sum + (item.pickedUpQuantity || 0) * (item.productSalePrice || 0),
        0
      );
      const saldoAcreditado = Math.max(0, totalPagado - Math.min(totalPagado, valorRecogido));

      // Todas las lecturas antes de cualquier escritura.
      const customerRef = plan.customerId
        ? doc(db, COLLECTIONS.CUSTOMERS, plan.customerId)
        : null;
      const customerSnap = saldoAcreditado > 0 && customerRef ? await tx.get(customerRef) : null;

      // Un producto que se elimino despues de separarlo no tiene a donde
      // volver. Antes el update sobre ese documento hacia fallar toda la
      // transaccion y el plan no se podia cancelar.
      const devolubles: typeof porDevolver = [];
      for (const linea of porDevolver) {
        const productoSnap = await tx.get(doc(db, COLLECTIONS.PRODUCTS, linea.productId));
        if (productoSnap.exists()) devolubles.push(linea);
      }

      tx.update(layawayRef, {
        status: 'cancelled',
        updatedAt: getColombiaTimestamp()
      });

      for (const { productId, cantidad } of devolubles) {
        tx.update(doc(db, COLLECTIONS.PRODUCTS, productId), {
          stock: increment(cantidad),
          updatedAt: getColombiaTimestamp()
        });
      }

      if (customerSnap?.exists() && customerRef) {
        tx.update(customerRef, {
          credit: ((customerSnap.data() as any).credit || 0) + saldoAcreditado,
          updatedAt: getColombiaTimestamp()
        });
      }

      return {
        yaCancelado: false,
        unidadesDevueltas: devolubles.reduce((sum, x) => sum + x.cantidad, 0),
        saldoAcreditado: customerSnap?.exists() ? saldoAcreditado : 0
      };
    });
  },

  async update(id: string, updates: Partial<LayawayPlan>): Promise<void> {
    console.log('✏️ Actualizando plan separe:', id, updates);
    
    const layawayRef = doc(db, COLLECTIONS.LAYAWAYS, id);
    await updateDoc(layawayRef, {
      ...updates,
      updatedAt: getColombiaTimestamp()
    });
    
    console.log('✅ Plan separe actualizado exitosamente');
  },

  /**
   * Agrega productos a un plan separe existente y reserva su inventario en
   * una sola transaccion.
   *
   * Antes se descontaba el stock en una transaccion y despues se guardaba el
   * plan en otro commit: si el segundo fallaba, el stock quedaba descontado
   * sin que el plan tuviera los productos. El plan ademas se leia fuera de la
   * transaccion, y totalCost / expectedProfit no se guardaban (solo se
   * actualizaban en la pantalla).
   */
  async addProductsToLayaway(
    layawayId: string,
    newItems: any[],
    additionalAmount: number,
    additionalCost = 0
  ): Promise<void> {
    console.log('➕ Agregando productos al plan separe existente...', {
      layawayId,
      newItems,
      additionalAmount
    });

    const layawayRef = doc(db, COLLECTIONS.LAYAWAYS, layawayId);
    const porProducto = agruparPedidos(
      newItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        productName: item.productName
      }))
    );

    await runTransaction(db, async (tx) => {
      // Firestore exige que todas las lecturas ocurran antes de cualquier escritura.
      const layawayDoc = await tx.get(layawayRef);
      if (!layawayDoc.exists()) {
        throw new Error('Plan separe no encontrado');
      }

      const existencias = new Map<string, number | null>();
      for (const productId of porProducto.keys()) {
        const snap = await tx.get(doc(db, COLLECTIONS.PRODUCTS, productId));
        existencias.set(productId, snap.exists() ? (snap.data().stock ?? 0) : null);
      }

      const faltantes = faltantesDeStock(porProducto, existencias);
      if (faltantes.length > 0) {
        throw new StockInsuficienteError(faltantes);
      }

      const currentLayaway = layawayDoc.data() as LayawayPlan;
      tx.update(layawayRef, {
        items: [...(currentLayaway.items || []), ...newItems],
        totalAmount: (currentLayaway.totalAmount || 0) + additionalAmount,
        totalCost: (currentLayaway.totalCost || 0) + additionalCost,
        expectedProfit: (currentLayaway.expectedProfit || 0) + (additionalAmount - additionalCost),
        remainingBalance: (currentLayaway.remainingBalance || 0) + additionalAmount,
        updatedAt: getColombiaTimestamp()
      });

      for (const [productId, { total }] of porProducto) {
        tx.update(doc(db, COLLECTIONS.PRODUCTS, productId), {
          stock: increment(-total),
          updatedAt: getColombiaTimestamp()
        });
      }
    });

    await waitForServerConfirmation();
    console.log('✅ Productos agregados al plan separe e inventario actualizado exitosamente');
  },

  // Suscripción simple sin filtros complejos
  subscribe(callback: (layaways: LayawayPlan[]) => void) {
    console.log('🔄 Iniciando suscripción simple a planes separe...');
    return onSnapshot(
      collection(db, COLLECTIONS.LAYAWAYS), // Sin filtros ni ordenamiento
      (snapshot) => {
        console.log(`🔄 Actualización de planes separe: ${snapshot.docs.length}`);
        const layaways = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: convertTimestamp(doc.data().createdAt),
          updatedAt: convertTimestamp(doc.data().updatedAt)
        })) as LayawayPlan[];
        callback(layaways);
      },
      (error) => {
        console.error('❌ Error en suscripción de planes separe:', error);
      }
    );
  },

  // Suscripción filtrada por estado
  subscribeByStatus(
    status: 'active' | 'completed' | 'cancelled', 
    callback: (layaways: LayawayPlan[]) => void
  ): () => void {
    console.log(`🔄 Iniciando suscripción a planes separe con estado: ${status}...`);
    // Consulta simplificada sin orderBy para evitar índice compuesto
    const q = query(
      collection(db, COLLECTIONS.LAYAWAYS),
      where('status', '==', status)
    );
    
    return onSnapshot(q, (querySnapshot) => {
      let layaways = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: convertTimestamp(doc.data().createdAt),
        updatedAt: convertTimestamp(doc.data().updatedAt)
      })) as LayawayPlan[];

      console.log(`🔄 Planes separe ${status} actualizados (${layaways.length})`);
      callback(layaways);
    }, (error) => {
      console.error(`❌ Error en suscripción a planes separe ${status}:`, error);
    });
  },

  async delete(id: string): Promise<void> {
    console.log('🗑️ Eliminando plan separe:', id);

    const layawayRef = doc(db, COLLECTIONS.LAYAWAYS, id);
    const layawayDoc = await getDoc(layawayRef);

    if (!layawayDoc.exists()) {
      throw new Error('Plan separe no encontrado');
    }

    const layawayData = layawayDoc.data() as LayawayPlan;
    const batch = writeBatch(db);

    batch.delete(layawayRef);

    // IMPORTANTE: si el plan ya está cancelado, el stock no recogido YA fue
    // devuelto por handleCancelLayaway en Layaway.tsx. NO restaurar otra vez
    // o se generaría un doble incremento de inventario.
    // Para activos / completed, devolvemos las unidades reservadas que no
    // hayan sido recogidas (las recogidas salieron físicamente de la tienda).
    if (layawayData.status !== 'cancelled') {
      for (const item of layawayData.items || []) {
        const reservedNotPicked = Math.max(
          0,
          (item.quantity || 0) - (item.pickedUpQuantity || 0)
        );
        if (reservedNotPicked > 0 && item.productId) {
          const productRef = doc(db, COLLECTIONS.PRODUCTS, item.productId);
          const productDoc = await getDoc(productRef);
          if (productDoc.exists()) {
            batch.update(productRef, {
              stock: increment(reservedNotPicked),
              updatedAt: getColombiaTimestamp()
            });
          }
        }
      }
    }

    await batch.commit();
    await waitForServerConfirmation();
    console.log(
      layawayData.status === 'cancelled'
        ? '✅ Plan separe (cancelado) eliminado — stock ya estaba devuelto'
        : '✅ Plan separe eliminado y stock no recogido restaurado'
    );
  }
};

// Technical Services Service
export const technicalServicesService = {
  async getAll(): Promise<TechnicalService[]> {
    console.log('🔍 Obteniendo todos los servicios técnicos...');
    try {
      const querySnapshot = await getDocs(collection(db, COLLECTIONS.TECHNICAL_SERVICES));
      
      const technicalServices = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: convertTimestamp(doc.data().createdAt),
        updatedAt: convertTimestamp(doc.data().updatedAt),
        completedAt: convertTimestamp(doc.data().completedAt),
        deliveredAt: convertTimestamp(doc.data().deliveredAt),
        estimatedCompletionDate: convertTimestamp(doc.data().estimatedCompletionDate),
      })) as TechnicalService[];
      
      console.log(`✅ Se obtuvieron ${technicalServices.length} servicios técnicos`);
      return technicalServices;
    } catch (error) {
      console.error('❌ Error obteniendo servicios técnicos:', error);
      throw error;
    }
  },

  async getByStatus(status: 'active' | 'completed' | 'cancelled'): Promise<TechnicalService[]> {
    console.log(`🔍 Obteniendo servicios técnicos con estado: ${status}...`);
    try {
      // Consulta simplificada sin orderBy para evitar índice compuesto
      const q = query(
        collection(db, COLLECTIONS.TECHNICAL_SERVICES),
        where('status', '==', status)
      );
      const querySnapshot = await getDocs(q);
      
      let technicalServices = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: convertTimestamp(doc.data().createdAt),
        updatedAt: convertTimestamp(doc.data().updatedAt),
        completedAt: convertTimestamp(doc.data().completedAt),
        deliveredAt: convertTimestamp(doc.data().deliveredAt),
        estimatedCompletionDate: convertTimestamp(doc.data().estimatedCompletionDate),
      })) as TechnicalService[];

      // Ordenar en memoria por createdAt desc
      technicalServices.sort((a, b) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate;
      });

      console.log(`✅ Servicios técnicos obtenidos (${status}): ${technicalServices.length}`);
      return technicalServices;
    } catch (error) {
      console.error(`❌ Error obteniendo servicios técnicos (${status}):`, error);
      throw error;
    }
  },

  async getById(id: string): Promise<TechnicalService | null> {
    try {
      const docRef = doc(db, COLLECTIONS.TECHNICAL_SERVICES, id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: convertTimestamp(data.createdAt),
          updatedAt: convertTimestamp(data.updatedAt),
          completedAt: convertTimestamp(data.completedAt),
          deliveredAt: convertTimestamp(data.deliveredAt),
          estimatedCompletionDate: convertTimestamp(data.estimatedCompletionDate),
        } as TechnicalService;
      }
      return null;
    } catch (error) {
      console.error('Error getting technical service:', error);
      throw error;
    }
  },

  async add(technicalServiceData: Omit<TechnicalService, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    console.log('📝 Creando nuevo servicio técnico...');
    
    try {
      const technicalServiceRef = doc(collection(db, COLLECTIONS.TECHNICAL_SERVICES));
      
      const technicalService = {
        ...technicalServiceData,
        createdAt: getColombiaTimestamp(),
        updatedAt: getColombiaTimestamp(),
      };

      // Limpiar undefined antes de guardar
      const cleanedService = removeUndefined(cleanTimestamps(technicalService));

      // Los repuestos sin productId son partes externas que no salen del
      // inventario, asi que no entran en la reserva. Las cortesias si.
      const pedidos: Pedido[] = [
        ...(technicalServiceData.items as any[])
          .filter(item => item.productId)
          .map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            productName: item.productName || item.partName
          })),
        ...(((technicalServiceData.courtesyItems || []) as any[])
          .filter(c => c.productId)
          .map(c => ({
            productId: c.productId,
            quantity: c.quantity,
            productName: c.productName
          })))
      ];

      // El servicio y la reserva de sus repuestos, en un solo commit.
      await reservarExistencias(pedidos, (tx) => tx.set(technicalServiceRef, cleanedService));
      await waitForServerConfirmation();
      console.log('✅ Servicio técnico creado con ID:', technicalServiceRef.id);
      return technicalServiceRef.id;
    } catch (error) {
      console.error('❌ Error creando servicio técnico:', error);
      throw error;
    }
  },

  async update(id: string, updates: Partial<TechnicalService>): Promise<void> {
    console.log('📝 Actualizando servicio técnico:', id);
    try {
      const technicalServiceRef = doc(db, COLLECTIONS.TECHNICAL_SERVICES, id);
      const updateData = {
        ...updates,
        updatedAt: getColombiaTimestamp(),
      };
      
      await updateDoc(technicalServiceRef, cleanTimestamps(updateData));
      await waitForServerConfirmation();
      console.log('✅ Servicio técnico actualizado');
    } catch (error) {
      console.error('❌ Error actualizando servicio técnico:', error);
      throw error;
    }
  },

  async addPayment(technicalServiceId: string, payment: any): Promise<void> {
    console.log('💰 Agregando pago al servicio técnico:', technicalServiceId);
    try {
      const technicalServiceRef = doc(db, COLLECTIONS.TECHNICAL_SERVICES, technicalServiceId);
      const technicalServiceSnap = await getDoc(technicalServiceRef);
      
      if (!technicalServiceSnap.exists()) {
        throw new Error('Servicio técnico no encontrado');
      }
      
      const technicalServiceData = technicalServiceSnap.data() as TechnicalService;
      const updatedPayments = [...(technicalServiceData.payments || []), payment];
      const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
      const newRemainingBalance = Math.max(0, technicalServiceData.totalAmount - totalPaid);
      
      const updates: Partial<TechnicalService> = {
        payments: updatedPayments,
        remainingBalance: newRemainingBalance,
        updatedAt: getColombiaTimestamp(),
      };
      
      if (newRemainingBalance === 0 && technicalServiceData.status === 'completed') {
        updates.status = 'delivered';
        updates.deliveredAt = getColombiaTimestamp();
      }
      
      await updateDoc(technicalServiceRef, cleanTimestamps(updates));
      await waitForServerConfirmation();
      console.log('✅ Pago agregado al servicio técnico');
    } catch (error) {
      console.error('❌ Error agregando pago al servicio técnico:', error);
      throw error;
    }
  },

  /**
   * Quita del servicio tecnico el pago que corresponde a un registro de venta
   * que se va a eliminar desde Gestion de Ventas.
   *
   * Antes solo se borraba la venta: el pago seguia en el servicio, el saldo
   * pendiente no volvia a subir y el cliente figuraba con un pago que la caja
   * ya no tenia. El registro de venta no guarda el id del pago, asi que se
   * busca por monto; si hay varios iguales no se puede saber cual es y se
   * prefiere no tocar nada (igual que con los abonos de plan separe).
   *
   * La venta se borra en la misma transaccion.
   */
  async quitarPagoDeVenta(serviceId: string, monto: number, saleId: string): Promise<void> {
    const serviceRef = doc(db, COLLECTIONS.TECHNICAL_SERVICES, serviceId);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(serviceRef);
      if (!snap.exists()) {
        throw new Error('No se encontró el servicio técnico de este pago. No se eliminó nada para no descuadrar el servicio.');
      }

      const servicio = snap.data() as TechnicalService;
      const pagos = servicio.payments || [];
      const candidatos = pagos.filter(p => p.amount === monto);
      if (candidatos.length === 0) {
        throw new Error('No se encontró el pago correspondiente dentro del servicio técnico. No se eliminó nada.');
      }
      if (candidatos.length > 1) {
        throw new Error(`El servicio técnico tiene ${candidatos.length} pagos por ese mismo monto y no se puede saber cuál corresponde. Elimínalo desde el servicio técnico.`);
      }

      // Misma cuenta que al cancelar un pago desde la pantalla de Servicio Técnico.
      const pagosRestantes = pagos.filter(p => p.id !== candidatos[0].id);
      const totalPagado = pagosRestantes.reduce((sum, p) => sum + p.amount, 0);
      const nuevoSaldo = servicio.totalAmount - totalPagado;

      const cambios: Record<string, unknown> = {
        payments: pagosRestantes,
        remainingBalance: nuevoSaldo,
        updatedAt: getColombiaTimestamp()
      };

      if (servicio.status === 'completed' && nuevoSaldo > 0) {
        cambios.status = 'active';
        cambios.items = (servicio.items || []).map(item => {
          const historialManual = (item.pickedUpHistory || []).filter(
            pickup => pickup.notes !== 'Marcado automáticamente como recogido al completar el pago'
          );
          return {
            ...item,
            pickedUpQuantity: historialManual.reduce((sum, pickup) => sum + pickup.quantity, 0),
            pickedUpHistory: historialManual
          };
        });
      }

      tx.update(serviceRef, removeUndefined(cambios));
      tx.delete(doc(db, COLLECTIONS.SALES, saleId));
    });

    await waitForServerConfirmation();
  },

  async delete(id: string): Promise<void> {
    console.log('🗑️ Eliminando servicio técnico:', id);

    const serviceRef = doc(db, COLLECTIONS.TECHNICAL_SERVICES, id);
    const serviceDoc = await getDoc(serviceRef);

    if (!serviceDoc.exists()) {
      throw new Error('Servicio técnico no encontrado');
    }

    const serviceData = serviceDoc.data() as TechnicalService;
    const batch = writeBatch(db);

    batch.delete(serviceRef);

    // Devolver repuestos no recogidos al stock. Solo afecta items con productId
    // — los repuestos personalizados (sin productId) nunca descontaron inventario.
    //
    // NOTA: a diferencia de los planes separe, `processCancellation` en
    // TechnicalService.tsx NO devuelve stock al cancelar; solo cambia status.
    // Por eso aquí restauramos en TODOS los casos (active, completed, cancelled),
    // sin guard de status — si lo añadiéramos, los servicios cancelados dejarían
    // el stock atrapado para siempre.
    for (const item of serviceData.items || []) {
      const productId = (item as any).productId;
      if (!productId) continue;
      const reservedNotPicked = Math.max(
        0,
        (item.quantity || 0) - ((item as any).pickedUpQuantity || 0)
      );
      if (reservedNotPicked > 0) {
        const productRef = doc(db, COLLECTIONS.PRODUCTS, productId);
        const productDoc = await getDoc(productRef);
        if (productDoc.exists()) {
          batch.update(productRef, {
            stock: increment(reservedNotPicked),
            updatedAt: getColombiaTimestamp()
          });
        }
      }
    }

    // Restaurar también stock de cortesías del servicio técnico
    if (serviceData.courtesyItems && Array.isArray(serviceData.courtesyItems)) {
      for (const courtesyItem of serviceData.courtesyItems) {
        if (!courtesyItem.productId) continue;
        const productRef = doc(db, COLLECTIONS.PRODUCTS, courtesyItem.productId);
        const productDoc = await getDoc(productRef);
        if (productDoc.exists()) {
          batch.update(productRef, {
            stock: increment(courtesyItem.quantity),
            updatedAt: getColombiaTimestamp()
          });
        }
      }
    }

    await batch.commit();
    await waitForServerConfirmation();
    console.log('✅ Servicio técnico eliminado y stock no recogido restaurado');
  },

  subscribe(callback: (technicalServices: TechnicalService[]) => void): () => void {
    const q = query(
      collection(db, COLLECTIONS.TECHNICAL_SERVICES),
      orderBy('createdAt', 'desc')
    );
    
    return onSnapshot(q, (querySnapshot) => {
      const technicalServices = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: convertTimestamp(doc.data().createdAt),
        updatedAt: convertTimestamp(doc.data().updatedAt),
        completedAt: convertTimestamp(doc.data().completedAt),
        deliveredAt: convertTimestamp(doc.data().deliveredAt),
        estimatedCompletionDate: convertTimestamp(doc.data().estimatedCompletionDate),
      } as TechnicalService));
      callback(technicalServices);
    }, (error) => {
      // Sin este callback un fallo de lectura se veria como lista vacia.
      console.error('Error escuchando servicios técnicos:', error);
    });
  },

  subscribeByStatus(
    status: 'active' | 'completed' | 'cancelled', 
    callback: (technicalServices: TechnicalService[]) => void
  ): () => void {
    console.log(`🔄 Iniciando suscripción a servicios técnicos con estado: ${status}...`);
    // Consulta simplificada sin orderBy para evitar índice compuesto
    const q = query(
      collection(db, COLLECTIONS.TECHNICAL_SERVICES),
      where('status', '==', status)
    );
    
    return onSnapshot(q, (querySnapshot) => {
      let technicalServices = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: convertTimestamp(doc.data().createdAt),
        updatedAt: convertTimestamp(doc.data().updatedAt),
        completedAt: convertTimestamp(doc.data().completedAt),
        deliveredAt: convertTimestamp(doc.data().deliveredAt),
        estimatedCompletionDate: convertTimestamp(doc.data().estimatedCompletionDate),
      } as TechnicalService));
      
      // Ordenar en memoria por createdAt desc
      technicalServices.sort((a, b) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate;
      });
      
      console.log(`🔄 Servicios técnicos actualizados (${status}): ${technicalServices.length}`);
      callback(technicalServices);
    }, (error) => {
      // Sin este callback un fallo de lectura se veria como lista vacia.
      console.error('Error escuchando servicios técnicos:', error);
    });
  }
};

// Dashboard Stats Service (calculated server-side for performance)
export const statsService = {
  async getDashboardStats(): Promise<DashboardStats> {
    // This could be calculated by a Cloud Function for better performance
    // For now, we'll calculate on the client but you can move this to a function later
    
    const [products, sales, allLayaways, customers, categories] = await Promise.all([
      productsService.getAll(),
      salesService.getAll(),
      layawaysService.getAll(), // Obtener todos y filtrar en el cliente
      customersService.getAll(),
      categoriesService.getAll()
    ]);

    // Filtrar layaways activos en el cliente
    const activeLayaways = allLayaways.filter(layaway => layaway.status === 'active');

    const todayKey = bogotaDateKey();
    const todaysSales = sales.filter(sale =>
      bogotaDateKey(new Date(sale.createdAt)) === todayKey
    );
    
    const layawayRevenue = allLayaways.reduce((sum, layaway) => 
      sum + (layaway.totalAmount - layaway.remainingBalance), 0
    );

    // Separar ventas regulares de abonos y entregas de layaway para cálculo correcto
    const regularSales = sales.filter(sale => !sale.type || sale.type === 'regular');
    const layawayPayments = sales.filter(sale => sale.type === 'layaway_payment');
    const technicalServicePayments = sales.filter(sale => sale.type === 'technical_service_payment');

    // Total de ventas = ventas regulares + abonos + servicios técnicos (sin duplicar en entregas)
    const totalSales = [...regularSales, ...layawayPayments, ...technicalServicePayments].reduce((sum, sale) => sum + (sale.finalTotal || sale.total), 0);
    
    // Costos y ganancias incluyen todos los tipos
    const totalCost = sales.reduce((sum, sale) => sum + sale.totalCost, 0);
    const totalProfit = sales.reduce((sum, sale) => sum + sale.totalProfit, 0);
    
    // Para el margen, usar el totalSales que ya excluye entregas duplicadas
    const averageProfitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

    const inventoryValue = products.reduce((sum, product) => 
      sum + (product.stock * product.purchasePrice), 0
    );
    const potentialRevenue = products.reduce((sum, product) => 
      sum + (product.stock * product.salePrice), 0
    );
    
    return {
      totalSales,
      totalProducts: products.length,
      lowStockCount: products.filter(product => product.stock <= 5).length,
      todaysSales: todaysSales.reduce((sum, sale) => sum + (sale.finalTotal || sale.total), 0),
      todaysTransactions: todaysSales.length,
      activeLayaways: activeLayaways.length,
      layawayRevenue,
      totalCost,
      totalProfit,
      averageProfitMargin,
      inventoryValue,
      potentialRevenue,
      totalCustomers: customers.length,
      totalCategories: categories.filter(c => c.isActive).length,
    };
  }
};

// Purchases Service
export const purchasesService = {
  async add(purchaseData: Omit<Purchase, 'id' | 'createdAt'>): Promise<string> {
    try {
      const batch = writeBatch(db);
      
      // Crear el documento de compra
      const purchaseRef = doc(collection(db, COLLECTIONS.PURCHASES));
      
      // Filtrar campos undefined para evitar errores de Firebase
      const purchase: any = {
        items: purchaseData.items,
        totalCost: purchaseData.totalCost,
        totalItems: purchaseData.totalItems,
        createdAt: getColombiaTimestamp(),
      };
      
      // Solo agregar notes si no está vacío
      if (purchaseData.notes && purchaseData.notes.trim()) {
        purchase.notes = purchaseData.notes.trim();
      }
      
      batch.set(purchaseRef, purchase);

      // Actualizar el inventario de cada producto.
      // El stock se actualiza con increment() para que sea atómico y no compita
      // con ventas u otras operaciones concurrentes. El precio promedio ponderado
      // sigue calculándose con la lectura previa — su pequeña ventana de race
      // sólo afecta el costo promedio reportado, no el conteo de unidades.
      for (const item of purchaseData.items) {
        const productRef = doc(db, COLLECTIONS.PRODUCTS, item.productId);
        const productSnap = await getDoc(productRef);

        if (!productSnap.exists()) {
          throw new Error(`Producto no encontrado: ${item.productId}`);
        }

        const product = productSnap.data() as Product;
        const currentStock = product.stock;
        const currentPurchasePrice = product.purchasePrice;

        // Stock proyectado para el cálculo del precio promedio (no para escribir)
        const projectedStock = currentStock + item.quantity;

        // Precio promedio ponderado:
        // (stock_actual * precio_actual + nuevas_unidades * nuevo_precio) / stock_total
        const totalValue = (currentStock * currentPurchasePrice) + (item.quantity * item.purchasePrice);
        const newPurchasePrice = projectedStock > 0 ? totalValue / projectedStock : item.purchasePrice;

        // Actualizar producto — stock con increment() para atomicidad
        batch.update(productRef, {
          stock: increment(item.quantity),
          purchasePrice: Math.round(newPurchasePrice), // Redondear para evitar decimales largos
          salePrice: item.newSalePrice || product.salePrice, // Actualizar precio de venta si se proporciona
          updatedAt: getColombiaTimestamp(),
        });
      }

      await batch.commit();
      await waitForServerConfirmation();
      return purchaseRef.id;
    } catch (error) {
      console.error('Error adding purchase:', error);
      throw error;
    }
  },

  async getAll(): Promise<Purchase[]> {
    try {
      const q = query(
        collection(db, COLLECTIONS.PURCHASES),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Purchase[];
    } catch (error) {
      console.error('Error getting purchases:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<Purchase | null> {
    try {
      const docRef = doc(db, COLLECTIONS.PURCHASES, id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        } as Purchase;
      }
      return null;
    } catch (error) {
      console.error('Error getting purchase:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const purchaseRef = doc(db, COLLECTIONS.PURCHASES, id);
      const purchaseDoc = await getDoc(purchaseRef);

      if (!purchaseDoc.exists()) {
        throw new Error('Compra no encontrada');
      }

      const purchaseData = purchaseDoc.data() as Purchase;
      const batch = writeBatch(db);

      batch.delete(purchaseRef);

      // Revertir el stock que esta compra agregó al inventario, neto de
      // cualquier devolución que ya se haya procesado contra ella (las
      // devoluciones ya descontaron por su lado en usePurchaseReturns).
      for (const item of purchaseData.items || []) {
        const previouslyReturned = (purchaseData.returns || []).reduce((sum, ret) => {
          const ri = (ret.items || []).find(r => r.productId === item.productId);
          return sum + (ri?.returnedQuantity || 0);
        }, 0);
        const netAdded = (item.quantity || 0) - previouslyReturned;

        if (netAdded > 0 && item.productId) {
          const productRef = doc(db, COLLECTIONS.PRODUCTS, item.productId);
          const productSnap = await getDoc(productRef);
          if (productSnap.exists()) {
            batch.update(productRef, {
              stock: increment(-netAdded),
              updatedAt: getColombiaTimestamp(),
            });
          }
        }
      }

      await batch.commit();
      await waitForServerConfirmation();
    } catch (error) {
      console.error('Error deleting purchase:', error);
      throw error;
    }
  },

  subscribe(callback: (purchases: Purchase[]) => void): () => void {
    const q = query(
      collection(db, COLLECTIONS.PURCHASES),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (querySnapshot) => {
      const purchases = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Purchase));
      callback(purchases);
    }, (error) => {
      // Sin este callback un fallo de lectura se veria como lista vacia.
      console.error('Error escuchando compras:', error);
    });
  }
};

// Courtesies Service
export const courtesiesService = {
  async getAll(): Promise<any[]> {
    try {
      const querySnapshot = await getDocs(
        query(collection(db, COLLECTIONS.COURTESIES), orderBy('createdAt', 'desc'))
      );
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        const cleanedData = cleanTimestamps(data);
        return {
          id: doc.id,
          ...cleanedData
        };
      });
    } catch (error) {
      console.error('Error getting courtesies:', error);
      throw error;
    }
  },

  async add(courtesy: Omit<any, 'id'>): Promise<string> {
    try {
      const courtesyRef = doc(collection(db, COLLECTIONS.COURTESIES));
      // Limpiar undefined antes de guardar
      const cleanedCourtesy = removeUndefined({
        ...courtesy,
        createdAt: getColombiaTimestamp()
      });
      await setDoc(courtesyRef, cleanedCourtesy);
      return courtesyRef.id;
    } catch (error) {
      console.error('Error adding courtesy:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, COLLECTIONS.COURTESIES, id));
    } catch (error) {
      console.error('Error deleting courtesy:', error);
      throw error;
    }
  },

  // Obtener cortesías por rango de fechas
  async getByDateRange(startDate: string, endDate: string): Promise<any[]> {
    try {
      const querySnapshot = await getDocs(
        query(
          collection(db, COLLECTIONS.COURTESIES),
          where('createdAt', '>=', startDate),
          where('createdAt', '<=', endDate),
          orderBy('createdAt', 'desc')
        )
      );
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        const cleanedData = cleanTimestamps(data);
        return {
          id: doc.id,
          ...cleanedData
        };
      });
    } catch (error) {
      console.error('Error getting courtesies by date range:', error);
      throw error;
    }
  },

  // Obtener cortesías por vendedor
  async getBySalesperson(salesPersonId: string): Promise<any[]> {
    try {
      const querySnapshot = await getDocs(
        query(
          collection(db, COLLECTIONS.COURTESIES),
          where('salesPersonId', '==', salesPersonId),
          orderBy('createdAt', 'desc')
        )
      );
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        const cleanedData = cleanTimestamps(data);
        return {
          id: doc.id,
          ...cleanedData
        };
      });
    } catch (error) {
      console.error('Error getting courtesies by salesperson:', error);
      throw error;
    }
  },

  // Obtener cortesías por cliente
  async getByCustomer(customerId: string): Promise<any[]> {
    try {
      const querySnapshot = await getDocs(
        query(
          collection(db, COLLECTIONS.COURTESIES),
          where('customerId', '==', customerId),
          orderBy('createdAt', 'desc')
        )
      );
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        const cleanedData = cleanTimestamps(data);
        return {
          id: doc.id,
          ...cleanedData
        };
      });
    } catch (error) {
      console.error('Error getting courtesies by customer:', error);
      throw error;
    }
  }
};