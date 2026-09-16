import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Purchase } from '../types';
import { startOfDayBogota, endOfDayBogota, subtractDaysBogota } from '../utils/dateUtils';

interface UsePurchasesStatsOptions {
  searchTerm?: string;
  dateFilter?: string;
  customDateRange?: { startDate: string; endDate: string };
}

export function usePurchasesStats({
  searchTerm = '',
  dateFilter = 'today',
  customDateRange = { startDate: '', endDate: '' },
}: UsePurchasesStatsOptions) {
  const [stats, setStats] = useState({
    totalPurchases: 0,
    totalCost: 0,
    totalItems: 0,
    averagePurchase: 0,
    purchaseCount: 0,
    loading: true,
    error: null as string | null,
  });

  const fetchStats = useCallback(async () => {
    setStats((s) => ({ ...s, loading: true, error: null }));
    
    try {
      // Don't fetch stats if custom date filter is selected but no dates are provided
      if (dateFilter === 'custom' && (!customDateRange.startDate || !customDateRange.endDate)) {
        setStats({
          totalPurchases: 0,
          totalCost: 0,
          totalItems: 0,
          averagePurchase: 0,
          purchaseCount: 0,
          loading: false,
          error: null,
        });
        return;
      }
      
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
          if (customDateRange.startDate) startISO = startOfDayBogota(customDateRange.startDate);
          if (customDateRange.endDate)   endISO   = endOfDayBogota(customDateRange.endDate);
          break;
      }

      if (startISO) constraints.push(where('createdAt', '>=', startISO));
      if (endISO)   constraints.push(where('createdAt', '<=', endISO));

      // Build query
      const finalQuery = constraints.length > 0 ? query(q, ...constraints) : q;
      const querySnapshot = await getDocs(finalQuery);
      
      const purchases: Purchase[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Purchase));

      // Apply search filter (client-side)
      let filteredPurchases = purchases;
      if (searchTerm.trim()) {
        filteredPurchases = purchases.filter(purchase =>
          purchase.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          purchase.items.some(item => 
            item.productName.toLowerCase().includes(searchTerm.toLowerCase())
          ) ||
          (purchase.notes && purchase.notes.toLowerCase().includes(searchTerm.toLowerCase()))
        );
      }

      // Calculate stats
      const totalPurchases = filteredPurchases.reduce((sum, purchase) => sum + (purchase.totalCost || 0), 0);
      const totalItems = filteredPurchases.reduce((sum, purchase) => sum + (purchase.totalItems || 0), 0);
      const purchaseCount = filteredPurchases.length;
      const averagePurchase = purchaseCount > 0 ? totalPurchases / purchaseCount : 0;

      setStats({
        totalPurchases,
        totalCost: totalPurchases, // Same as totalPurchases for consistency
        totalItems,
        averagePurchase,
        purchaseCount,
        loading: false,
        error: null,
      });
    } catch (error: any) {
      console.error('Error fetching purchase stats:', error);
      setStats(s => ({
        ...s,
        loading: false,
        error: error.message || 'Error desconocido al cargar estadísticas de compras',
      }));
    }
  }, [searchTerm, dateFilter, customDateRange]);

  const refetch = useCallback(() => {
    fetchStats();
  }, [fetchStats]);

  // Clear stats immediately when switching to custom filter without complete date range
  useEffect(() => {
    if (dateFilter === 'custom' && (!customDateRange.startDate || !customDateRange.endDate)) {
      setStats({
        totalPurchases: 0,
        totalCost: 0,
        totalItems: 0,
        averagePurchase: 0,
        purchaseCount: 0,
        loading: false,
        error: null,
      });
    }
  }, [dateFilter, customDateRange.startDate, customDateRange.endDate]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    ...stats,
    refetch
  };
}
