import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, orderBy, limit, startAfter, getDocs, getDocsFromServer } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Sale } from '../types';
import { startOfDayBogota, endOfDayBogota, subtractDaysBogota } from '../utils/dateUtils';

interface UsePaginatedSalesOptions {
  searchTerm?: string;
  dateFilter?: string;
  customDateRange?: { startDate: string; endDate: string };
  timeRange?: { startTime: string; endTime: string };
  paymentMethodFilter?: string;
  salesPersonFilter?: string;
  sortBy?: 'date' | 'total' | 'profit';
  sortOrder?: 'asc' | 'desc';
  itemsPerPage?: number;
  minAmount?: number;
  maxAmount?: number;
  profitRangeFilter?: string;
  useFreshData?: boolean; // Forzar obtener datos del servidor sin caché
}

export function usePaginatedSales({
  searchTerm = '',
  dateFilter = 'today',
  customDateRange = { startDate: '', endDate: '' },
  timeRange = { startTime: '', endTime: '' },
  paymentMethodFilter = 'all',
  salesPersonFilter = 'all',
  sortBy = 'date',
  sortOrder = 'desc',
  itemsPerPage = 10,
  minAmount,
  maxAmount,
  profitRangeFilter = 'all',
  useFreshData = false,
}: UsePaginatedSalesOptions) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);

  // Helper to build Firestore query
  const buildQuery = useCallback(async (_page: number, prevLastDoc: any = null): Promise<any | null> => {
    let q = collection(db, 'sales');
    let constraints: any[] = [];

    // Date filter — siempre calculado en día calendario Colombia
    // (independiente de la TZ del navegador). Devuelve ISO UTC.
    const startDateISO = computeStartISO(dateFilter, customDateRange);
    const endDateISO   = computeEndISO(dateFilter, customDateRange);
    if (dateFilter === 'custom' && (!startDateISO || !endDateISO)) {
      // Custom requiere ambas fechas
      return null;
    }

    // Time-of-day refinement: si el usuario filtra por horario, ajustamos
    // los límites en hora Colombia (no en hora del navegador).
    let finalStartISO = startDateISO;
    let finalEndISO   = endDateISO;
    if (timeRange.startTime && timeRange.endTime && finalStartISO && finalEndISO) {
      finalStartISO = applyTimeOfDayBogota(finalStartISO, timeRange.startTime, 'start');
      finalEndISO   = applyTimeOfDayBogota(finalEndISO,   timeRange.endTime,   'end');
    }

    // NOTA: Mantenemos los filtros de fecha del lado cliente
    // (filterSalesClientSide). Las constraints Firestore se podrían reactivar
    // ahora que los rangos son TZ-independientes, pero requieren índices extra.
    // if (finalStartISO) constraints.push(where('createdAt', '>=', finalStartISO));
    // if (finalEndISO)   constraints.push(where('createdAt', '<=', finalEndISO));

    // Payment method filter
    // NOTA: No aplicar filtro de método de pago en Firestore porque ahora usamos paymentMethods (array)
    // El filtro se aplicará en el cliente para soportar tanto el formato antiguo como el nuevo

    // Salesperson filter
    if (salesPersonFilter !== 'all') {
      constraints.push(where('salesPersonId', '==', salesPersonFilter));
    }

    // Amount filters (implemented on client side for better flexibility)
    if (minAmount && minAmount > 0) {
      constraints.push(where('total', '>=', minAmount));
    }
    if (maxAmount && maxAmount > 0) {
      constraints.push(where('total', '<=', maxAmount));
    }

    // Order
    let orderField = 'createdAt';
    if (sortBy === 'total') orderField = 'total';
    if (sortBy === 'profit') orderField = 'totalProfit';
    constraints.push(orderBy(orderField, sortOrder));

    // ⚡ OPTIMIZADO: Si hay búsqueda O filtro de fecha, traer más docs
    // porque filtramos en el cliente
    if (searchTerm.trim() || dateFilter !== 'all') {
      // Con búsqueda o filtro de fecha: traer hasta 1000 docs para filtrar en cliente
      constraints.push(limit(1000));
    } else {
      // Sin búsqueda ni filtro: paginación normal de Firestore
      constraints.push(limit(itemsPerPage + 1)); // +1 to check if there is next page
      if (prevLastDoc) constraints.push(startAfter(prevLastDoc));
    }

    // Build query
    return query(q, ...constraints);
  }, [dateFilter, customDateRange, timeRange, paymentMethodFilter, salesPersonFilter, sortBy, sortOrder, itemsPerPage, minAmount, maxAmount, searchTerm]);

  // Helper to filter sales on client side (for complex filters)
  const filterSalesClientSide = useCallback((salesList: Sale[]) => {
    // Rango de fechas en día calendario Colombia (TZ-independiente).
    let startISO = computeStartISO(dateFilter, customDateRange);
    let endISO   = computeEndISO(dateFilter, customDateRange);
    if (timeRange.startTime && timeRange.endTime && startISO && endISO) {
      startISO = applyTimeOfDayBogota(startISO, timeRange.startTime, 'start');
      endISO   = applyTimeOfDayBogota(endISO,   timeRange.endTime,   'end');
    }

    if (dateFilter === 'today' && salesList.length > 0) {
      console.log('🔍 Filtro de fecha CLIENT-SIDE (Bogotá):', {
        dateFilter,
        startISO,
        endISO,
        totalVentas: salesList.length,
        primeraVenta: salesList[0]?.createdAt,
      });
    }

    return salesList.filter(sale => {
      // Date filter (filtrado en cliente para evitar problemas de zona horaria)
      if (sale.createdAt) {
        // IGNORAR ventas con serverTimestamp sin resolver (están corruptas)
        if ((sale.createdAt as any)._methodName === 'serverTimestamp') {
          console.warn('⚠️ Venta con timestamp corrupto, ignorando:', sale.id);
          return false;
        }

        // Normalizar createdAt → ISO string UTC (soporta string ISO,
        // Firestore Timestamp y Timestamp serializado)
        const saleISO = normalizeCreatedAtToISO(sale.createdAt);
        if (!saleISO) return false;

        if (startISO && saleISO < startISO) return false;
        if (endISO && saleISO > endISO) return false;
      }

      // Search term filter (product names, sale ID, customer name)
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase();
        const matchesId = sale.id.toLowerCase().includes(searchLower);
        const matchesProducts = sale.items.some(item =>
          item.productName.toLowerCase().includes(searchLower)
        );
        const matchesCustomer = sale.customerName && sale.customerName.toLowerCase().includes(searchLower);

        if (!matchesId && !matchesProducts && !matchesCustomer) {
          return false;
        }
      }

      // Payment method filter (soporta tanto formato antiguo como nuevo)
      if (paymentMethodFilter !== 'all') {
        // Formato nuevo: paymentMethods (array)
        if (Array.isArray(sale.paymentMethods)) {
          const hasMethod = sale.paymentMethods.some((pm: any) => pm.method === paymentMethodFilter);
          if (!hasMethod) return false;
        }
        // Formato antiguo: paymentMethod (string)
        else if (sale.paymentMethod !== paymentMethodFilter) {
          return false;
        }
      }

      // Profit range filter
      if (profitRangeFilter !== 'all') {
        const profitMargin = sale.profitMargin ?? 0;
        switch (profitRangeFilter) {
          case 'high':
            if (profitMargin <= 30) return false;
            break;
          case 'medium':
            if (profitMargin < 15 || profitMargin > 30) return false;
            break;
          case 'low':
            if (profitMargin >= 15 || profitMargin < 0) return false;
            break;
          case 'loss':
            if (profitMargin >= 0) return false;
            break;
        }
      }

      return true;
    });
  }, [searchTerm, paymentMethodFilter, profitRangeFilter, dateFilter, customDateRange]);

  // Fetch sales
  const fetchSales = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      // Check if we should skip the query (e.g., custom date range without both dates)
      const testQuery = await buildQuery(1, null);
      if (!testQuery) {
        // No query to execute, set empty results
        setSales([]);
        setHasNextPage(false);
        setHasPrevPage(page > 1);
        setLastDoc(null);
        setLoading(false);
        return;
      }

      // ⚡ OPTIMIZADO: Lógica diferente según si hay búsqueda o filtros
      let salesList: Sale[] = [];

      if (searchTerm.trim() || dateFilter !== 'all') {
        // CON BÚSQUEDA O FILTROS: Traer todos los docs y filtrar localmente
        const q = await buildQuery(1, null);
        if (!q) {
          setSales([]);
          setHasNextPage(false);
          setHasPrevPage(false);
          setLastDoc(null);
          return;
        }

        const snap = useFreshData ? await getDocsFromServer(q) : await getDocs(q);
        console.log('🔍 Búsqueda/Filtros activos - ventas obtenidas:', snap.docs.length);

        salesList = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })) as Sale[];

        // Aplicar filtros del cliente (fecha, searchTerm, etc.)
        salesList = filterSalesClientSide(salesList);
        console.log('🔍 Resultados después de filtros:', salesList.length);

        // Paginar los resultados filtrados en el cliente
        const totalFiltered = salesList.length;
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;

        setHasNextPage(endIndex < totalFiltered);
        setHasPrevPage(page > 1);
        salesList = salesList.slice(startIndex, endIndex);
        setLastDoc(null); // No usamos lastDoc en modo búsqueda

      } else {
        // SIN BÚSQUEDA: Paginación normal de Firestore
        let prevLastDoc = null;
        let docsFetched: any[] = [];
        let lastVisible = null;

        // For deep pagination, we need to walk pages
        for (let i = 1; i <= page; i++) {
          const q = await buildQuery(i, prevLastDoc);
          if (!q) {
            setSales([]);
            setHasNextPage(false);
            setHasPrevPage(page > 1);
            setLastDoc(null);
            return;
          }

          const snap = useFreshData ? await getDocsFromServer(q) : await getDocs(q);
          if (useFreshData && i === 1) {
            console.log('🌐 Obteniendo ventas frescas desde el servidor (sin caché)');
          }
          const docs = snap.docs;
          if (i === page) {
            docsFetched = docs;
          }
          lastVisible = docs[docs.length - 1];
          prevLastDoc = lastVisible;
        }

        salesList = docsFetched.map(doc => ({ id: doc.id, ...doc.data() })) as Sale[];
        console.log('📊 Ventas obtenidas de Firestore:', salesList.length);

        // DEBUG: Mostrar las fechas de las primeras ventas para diagnosticar
        if (salesList.length > 0) {
          console.log('📅 DEBUG - Primeras 3 ventas con sus fechas:',
            salesList.slice(0, 3).map(s => ({
              id: s.id,
              createdAt: s.createdAt,
              createdAtType: typeof s.createdAt
            }))
          );
        } else {
          console.log('⚠️ DEBUG - No hay ventas en Firestore con los filtros aplicados');
        }

        // Apply client-side filters (NO searchTerm)
        const beforeFilter = salesList.length;
        salesList = filterSalesClientSide(salesList);
        console.log(`✅ Después del filtro de fecha: ${salesList.length} ventas (antes: ${beforeFilter})`);

        setHasNextPage(salesList.length > itemsPerPage);
        setHasPrevPage(page > 1);
        if (salesList.length > itemsPerPage) salesList = salesList.slice(0, itemsPerPage);
        setLastDoc(lastVisible);
      }

      setSales(salesList);
    } catch (err: any) {
      setError(err.message || 'Error al cargar ventas');
    } finally {
      setLoading(false);
    }
  }, [buildQuery, itemsPerPage, filterSalesClientSide, useFreshData]);

  // Main effect to handle data loading and clearing
  useEffect(() => {
    // Priority check: Immediately clear (synchronously) if custom date filter is selected but no dates are provided
    if (dateFilter === 'custom' && (!customDateRange.startDate || !customDateRange.endDate)) {
      console.log('🧹 Limpiando tabla inmediatamente - filtro personalizado sin fechas completas');
      setSales([]);
      setHasNextPage(false);
      setHasPrevPage(false);
      setLoading(false);
      setCurrentPage(1);
      return; // Exit early, don't execute fetch
    }
    
    // Only proceed with fetch if we have valid filter conditions
    const doFetch = async () => {
      console.log('🔄 Cargando datos con filtros:', { dateFilter, customDateRange });
      setCurrentPage(1);
      await fetchSales(1);
    };
    
    doFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, dateFilter, customDateRange, timeRange, paymentMethodFilter, salesPersonFilter, sortBy, sortOrder, itemsPerPage, minAmount, maxAmount, profitRangeFilter, useFreshData]);

  // Pagination handlers
  const nextPage = () => {
    if (hasNextPage) {
      setCurrentPage((p) => p + 1);
      fetchSales(currentPage + 1);
    }
  };
  const prevPage = () => {
    if (hasPrevPage && currentPage > 1) {
      setCurrentPage((p) => p - 1);
      fetchSales(currentPage - 1);
    }
  };

  return {
    sales,
    loading,
    error,
    currentPage,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    setPage: (page: number) => {
      setCurrentPage(page);
      fetchSales(page);
    },
    refetch: () => fetchSales(currentPage),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers de rango de fechas — siempre día calendario Colombia (UTC-5)
// ─────────────────────────────────────────────────────────────────────────

const BOGOTA_OFFSET = '-05:00';

function computeStartISO(
  dateFilter: string,
  customDateRange: { startDate: string; endDate: string }
): string | null {
  switch (dateFilter) {
    case 'today':    return startOfDayBogota();
    case 'week':     return startOfDayBogota(subtractDaysBogota(7));
    case 'month':    return startOfDayBogota(subtractDaysBogota(30));
    case '3months':  return startOfDayBogota(subtractDaysBogota(90));
    case '6months':  return startOfDayBogota(subtractDaysBogota(180));
    case 'year':     return startOfDayBogota(subtractDaysBogota(365));
    case 'custom':
      return customDateRange.startDate
        ? startOfDayBogota(customDateRange.startDate)
        : null;
    default: return null;
  }
}

function computeEndISO(
  dateFilter: string,
  customDateRange: { startDate: string; endDate: string }
): string | null {
  switch (dateFilter) {
    case 'today':    return endOfDayBogota();
    case 'week':
    case 'month':
    case '3months':
    case '6months':
    case 'year':     return endOfDayBogota(); // hasta hoy inclusive
    case 'custom':
      return customDateRange.endDate
        ? endOfDayBogota(customDateRange.endDate)
        : null;
    default: return null;
  }
}

/**
 * Reemplaza la hora del ISO por la hora indicada (HH:mm) interpretada en
 * hora Bogotá. `kind = 'start'` usa segundos 00, `'end'` usa 59.999.
 */
function applyTimeOfDayBogota(iso: string, hhmm: string, kind: 'start' | 'end'): string {
  // El ISO puede venir como "YYYY-MM-DDTHH:mm:ss.sssZ"; queremos el día Bogotá
  // de ese instante.
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso))
    .reduce((acc: Record<string,string>, p) => { acc[p.type] = p.value; return acc; }, {});
  const day = `${dateKey.year}-${dateKey.month}-${dateKey.day}`;
  const [h, m] = hhmm.split(':').map(Number);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const tail = kind === 'start' ? `${hh}:${mm}:00.000` : `${hh}:${mm}:59.999`;
  return new Date(`${day}T${tail}${BOGOTA_OFFSET}`).toISOString();
}

/** Convierte cualquier formato histórico de createdAt a ISO UTC string. */
function normalizeCreatedAtToISO(createdAt: any): string | null {
  if (!createdAt) return null;
  if (typeof createdAt === 'string') return createdAt;
  if (typeof createdAt.toDate === 'function') return createdAt.toDate().toISOString();
  if (typeof createdAt.seconds === 'number') return new Date(createdAt.seconds * 1000).toISOString();
  const d = new Date(createdAt);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
