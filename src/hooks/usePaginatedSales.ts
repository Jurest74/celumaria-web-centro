import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, orderBy, limit, startAfter, getDocs, getDocsFromServer } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Sale } from '../types';

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

    // Date filter
    const today = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    switch (dateFilter) {
      case 'today': {
        // Crear el rango del día actual en hora LOCAL
        startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
        endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

        console.log('📅 Filtro TODAY:', {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        });
        break;
      }
      case 'week':
        startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '3months':
        startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '6months':
        startDate = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        // Only execute query if both dates are selected
        if (customDateRange.startDate && customDateRange.endDate) {
          // Parse date in local timezone to avoid timezone issues
          const [yearStart, monthStart, dayStart] = customDateRange.startDate.split('-').map(Number);
          const [yearEnd, monthEnd, dayEnd] = customDateRange.endDate.split('-').map(Number);
          
          // Default full day range
          startDate = new Date(yearStart, monthStart - 1, dayStart, 0, 0, 0, 0);
          endDate = new Date(yearEnd, monthEnd - 1, dayEnd, 23, 59, 59, 999);
        } else {
          // Return early if both dates are not selected - no query should be executed
          return null;
        }
        break;
    }

    // Apply time filtering to any date range if timeRange is provided
    if (timeRange.startTime && timeRange.endTime && startDate && endDate) {
      const [startHour, startMinute] = timeRange.startTime.split(':').map(Number);
      const [endHour, endMinute] = timeRange.endTime.split(':').map(Number);
      
      // For single day ranges (today), apply time to the same day
      if (dateFilter === 'today') {
        startDate.setHours(startHour, startMinute, 0, 0);
        endDate.setHours(endHour, endMinute, 59, 999);
      } else {
        // For multi-day ranges, apply time filtering to the start and end dates
        startDate.setHours(startHour, startMinute, 0, 0);
        endDate.setHours(endHour, endMinute, 59, 999);
      }
    }
    // NOTA: Comentamos los filtros de fecha en Firestore porque causan problemas de zona horaria
    // El filtrado de fechas se hace en el cliente (ver filterSalesClientSide)
    // if (startDate) constraints.push(where('createdAt', '>=', startDate.toISOString()));
    // if (endDate) constraints.push(where('createdAt', '<=', endDate.toISOString()));

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
    // Calcular el rango de fechas para filtrado en cliente
    const today = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    switch (dateFilter) {
      case 'today':
        startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
        endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
        break;
      case 'week':
        startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '3months':
        startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '6months':
        startDate = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        if (customDateRange.startDate && customDateRange.endDate) {
          const [yearStart, monthStart, dayStart] = customDateRange.startDate.split('-').map(Number);
          const [yearEnd, monthEnd, dayEnd] = customDateRange.endDate.split('-').map(Number);
          startDate = new Date(yearStart, monthStart - 1, dayStart, 0, 0, 0, 0);
          endDate = new Date(yearEnd, monthEnd - 1, dayEnd, 23, 59, 59, 999);
        }
        break;
    }

    // DEBUG: Log del filtro de fechas
    if (dateFilter === 'today' && salesList.length > 0) {
      console.log('🔍 Filtro de fecha CLIENT-SIDE:', {
        dateFilter,
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        totalVentas: salesList.length,
        primeraVenta: salesList[0]?.createdAt
      });
    }

    return salesList.filter(sale => {
      // Date filter (filtrado en cliente para evitar problemas de zona horaria)
      if (sale.createdAt) {
        // IGNORAR ventas con serverTimestamp sin resolver (están corruptas)
        if (sale.createdAt._methodName === 'serverTimestamp') {
          console.warn('⚠️ Venta con timestamp corrupto, ignorando:', sale.id);
          return false;
        }

        // Convertir a Date, soportando tanto Timestamp de Firestore como ISO string
        let saleDate: Date;
        if (typeof sale.createdAt === 'string') {
          // Formato nuevo: ISO string
          saleDate = new Date(sale.createdAt);
        } else if (sale.createdAt.toDate && typeof sale.createdAt.toDate === 'function') {
          // Formato antiguo: Firestore Timestamp
          saleDate = sale.createdAt.toDate();
        } else if (sale.createdAt.seconds) {
          // Formato Timestamp serializado
          saleDate = new Date(sale.createdAt.seconds * 1000);
        } else {
          // Fallback
          saleDate = new Date(sale.createdAt);
        }

        // DEBUG: Log de comparación para las primeras ventas
        if (dateFilter === 'today' && salesList.indexOf(sale) < 3) {
          console.log(`🔍 Venta ${sale.id}:`, {
            createdAt: sale.createdAt,
            createdAtType: typeof sale.createdAt,
            saleDate: saleDate.toISOString(),
            startDate: startDate?.toISOString(),
            endDate: endDate?.toISOString(),
            pasaInicio: !startDate || saleDate >= startDate,
            pasaFin: !endDate || saleDate <= endDate
          });
        }

        if (startDate && saleDate < startDate) return false;
        if (endDate && saleDate > endDate) return false;
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

        salesList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Sale[];

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
