import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Purchase } from '../types';

// Corrige fechas tipo 'YYYY-MM-DD' para zona local
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

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
      
      // Date filter
      const today = new Date();
      let startDate: Date | null = null;
      let endDate: Date | null = null;

      switch (dateFilter) {
        case 'today': {
          // Rango local: 00:00:00 a 23:59:59 del día actual en zona local
          startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
          endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
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
          if (customDateRange.startDate) {
            startDate = parseLocalDate(customDateRange.startDate);
          }
          if (customDateRange.endDate) {
            endDate = parseLocalDate(customDateRange.endDate);
            endDate.setHours(23, 59, 59, 999);
          }
          break;
      }

      if (startDate) constraints.push(where('createdAt', '>=', startDate.toISOString()));
      if (endDate) constraints.push(where('createdAt', '<=', endDate.toISOString()));

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
