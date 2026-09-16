import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Purchase } from '../types';
import { startOfDayBogota, endOfDayBogota, subtractDaysBogota } from '../utils/dateUtils';

interface UsePaginatedPurchasesOptions {
  searchTerm?: string;
  dateFilter?: string;
  customDateRange?: { startDate: string; endDate: string };
  sortBy?: 'date' | 'totalCost' | 'totalItems';
  sortOrder?: 'asc' | 'desc';
  itemsPerPage?: number;
}

export function usePaginatedPurchases({
  searchTerm = '',
  dateFilter = 'today',
  customDateRange = { startDate: '', endDate: '' },
  sortBy = 'date',
  sortOrder = 'desc',
  itemsPerPage = 10,
}: UsePaginatedPurchasesOptions) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);

  // Helper to build Firestore query
  const buildQuery = useCallback((prevLastDoc: any = null): any | null => {
    let q = collection(db, 'purchases');
    let constraints: any[] = [];

    // Rango en día calendario Colombia (TZ-independiente)
    let startISO: string | null = null;
    let endISO: string | null = null;
    switch (dateFilter) {
      case 'today':    startISO = startOfDayBogota(); endISO = endOfDayBogota(); break;
      case 'week':     startISO = startOfDayBogota(subtractDaysBogota(7)); endISO = endOfDayBogota(); break;
      case 'month':    startISO = startOfDayBogota(subtractDaysBogota(30)); endISO = endOfDayBogota(); break;
      case '3months':  startISO = startOfDayBogota(subtractDaysBogota(90)); endISO = endOfDayBogota(); break;
      case '6months':  startISO = startOfDayBogota(subtractDaysBogota(180)); endISO = endOfDayBogota(); break;
      case 'year':     startISO = startOfDayBogota(subtractDaysBogota(365)); endISO = endOfDayBogota(); break;
      case 'custom':
        if (customDateRange.startDate && customDateRange.endDate) {
          startISO = startOfDayBogota(customDateRange.startDate);
          endISO   = endOfDayBogota(customDateRange.endDate);
        } else {
          return null;
        }
        break;
    }
    if (startISO) constraints.push(where('createdAt', '>=', startISO));
    if (endISO)   constraints.push(where('createdAt', '<=', endISO));

    // Order
    let orderField = 'createdAt';
    if (sortBy === 'totalCost') orderField = 'totalCost';
    if (sortBy === 'totalItems') orderField = 'totalItems';
    constraints.push(orderBy(orderField, sortOrder));

    // ⚡ OPTIMIZADO: Si hay búsqueda, traer más docs para buscar en todos
    if (searchTerm.trim()) {
      constraints.push(limit(1000)); // Con búsqueda: traer hasta 1000
    } else {
      constraints.push(limit(itemsPerPage + 1)); // Sin búsqueda: paginación normal
      if (prevLastDoc) constraints.push(startAfter(prevLastDoc));
    }

    // Build query
    return query(q, ...constraints);
  }, [dateFilter, customDateRange, sortBy, sortOrder, itemsPerPage, searchTerm]);

  // Fetch purchases
  const fetchPurchases = useCallback(async (page: number) => {
    // Early check: Don't fetch if custom date filter is selected but no dates are provided
    if (dateFilter === 'custom' && (!customDateRange.startDate || !customDateRange.endDate)) {
      console.log('🚫 Skipping fetch compras - filtro personalizado sin fechas completas');
      setPurchases([]);
      setHasNextPage(false);
      setHasPrevPage(page > 1);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      // Check if we should skip the query (e.g., custom date range without both dates)
      const testQuery = buildQuery(null);
      if (!testQuery) {
        // No query to execute, set empty results
        setPurchases([]);
        setHasNextPage(false);
        setHasPrevPage(page > 1);
        setLoading(false);
        return;
      }

      // ⚡ OPTIMIZADO: Lógica diferente según si hay búsqueda
      if (searchTerm.trim()) {
        // CON BÚSQUEDA: Traer todos los docs y filtrar localmente
        const q = buildQuery(null);
        if (!q) {
          setPurchases([]);
          setHasNextPage(false);
          setHasPrevPage(false);
          return;
        }

        const querySnapshot = await getDocs(q);
        console.log('🔍 Búsqueda activa en compras - docs obtenidos:', querySnapshot.docs.length);

        let allPurchases = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as any)
        } as Purchase));

        // Filtrar por término de búsqueda
        const searchLower = searchTerm.toLowerCase();
        allPurchases = allPurchases.filter(purchase =>
          purchase.id.toLowerCase().includes(searchLower) ||
          purchase.items.some(item =>
            item.productName.toLowerCase().includes(searchLower)
          ) ||
          (purchase.notes && purchase.notes.toLowerCase().includes(searchLower))
        );

        console.log('🔍 Resultados de búsqueda en compras:', allPurchases.length);

        // Paginar resultados filtrados
        const totalFiltered = allPurchases.length;
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;

        setHasNextPage(endIndex < totalFiltered);
        setHasPrevPage(page > 1);
        setPurchases(allPurchases.slice(startIndex, endIndex));

      } else {
        // SIN BÚSQUEDA: Paginación normal de Firestore
        let prevLastDoc = null;

        for (let i = 1; i <= page; i++) {
          const q = buildQuery(prevLastDoc);
          if (!q) {
            setPurchases([]);
            setHasNextPage(false);
            setHasPrevPage(page > 1);
            return;
          }
          const querySnapshot = await getDocs(q);
          const docs = querySnapshot.docs;

          if (i === page) {
            const pageSize = Math.min(itemsPerPage, docs.length);
            const purchasesData = docs.slice(0, pageSize).map(doc => ({
              id: doc.id,
              ...(doc.data() as any)
            } as Purchase));

            setPurchases(purchasesData);
            setHasNextPage(docs.length > itemsPerPage);
            setHasPrevPage(page > 1);
          } else {
            if (docs.length > 0) {
              prevLastDoc = docs[Math.min(itemsPerPage - 1, docs.length - 1)];
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching purchases:', err);
      setError(err.message || 'Error desconocido al cargar las compras');
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, [buildQuery, itemsPerPage, searchTerm, dateFilter, customDateRange]);

  // Refetch current page
  const refetch = useCallback(() => {
    fetchPurchases(currentPage);
  }, [fetchPurchases, currentPage]);

  // Navigation functions
  const nextPage = useCallback(() => {
    if (hasNextPage) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      fetchPurchases(newPage);
    }
  }, [hasNextPage, currentPage, fetchPurchases]);

  const prevPage = useCallback(() => {
    if (hasPrevPage) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      fetchPurchases(newPage);
    }
  }, [hasPrevPage, currentPage, fetchPurchases]);

  const setPage = useCallback((page: number) => {
    setCurrentPage(page);
    fetchPurchases(page);
  }, [fetchPurchases]);

  // Main effect to handle data loading and clearing
  useEffect(() => {
    // Priority check: Immediately clear (synchronously) if custom date filter is selected but no dates are provided
    if (dateFilter === 'custom' && (!customDateRange.startDate || !customDateRange.endDate)) {
      console.log('🧹 Limpiando tabla de compras inmediatamente - filtro personalizado sin fechas completas');
      setPurchases([]);
      setHasNextPage(false);
      setHasPrevPage(false);
      setLoading(false);
      setCurrentPage(1);
      return; // Exit early, don't execute fetch
    }
    
    // Only proceed with fetch if we have valid filter conditions
    const doFetch = async () => {
      console.log('🔄 Cargando compras con filtros:', { dateFilter, customDateRange });
      setCurrentPage(1);
      await fetchPurchases(1);
    };
    
    doFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, customDateRange, sortBy, sortOrder, searchTerm, itemsPerPage]);

  return {
    purchases,
    loading,
    error,
    currentPage,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    setPage,
    refetch
  };
}
