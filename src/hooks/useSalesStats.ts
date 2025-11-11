import { useEffect, useState, useCallback, useRef } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Sale } from '../types';

// Corrige fechas tipo 'YYYY-MM-DD' para zona local
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

interface UseSalesStatsOptions {
  searchTerm?: string;
  dateFilter?: string;
  customDateRange?: { startDate: string; endDate: string };
  timeRange?: { startTime: string; endTime: string };
  paymentMethodFilter?: string;
  salesPersonFilter?: string;
}

interface PeriodComparison {
  current: {
    totalSales: number;
    totalProfit: number;
    totalCost: number;
    transactionCount: number;
    profitMargin: number;
  };
  previous: {
    totalSales: number;
    totalProfit: number;
    totalCost: number;
    transactionCount: number;
    profitMargin: number;
  };
  growth: {
    salesGrowth: number;
    profitGrowth: number;
    transactionGrowth: number;
    marginGrowth: number;
  };
}

interface HistoricalData {
  period: string;
  totalSales: number;
  totalProfit: number;
  transactionCount: number;
  profitMargin: number;
}

interface TopPerformingProduct {
  productId: string;
  productName: string;
  totalSold: number;
  totalRevenue: number;
  totalProfit: number;
}

export function useSalesStats({
  searchTerm = '',
  dateFilter = 'today',
  customDateRange = { startDate: '', endDate: '' },
  timeRange = { startTime: '', endTime: '' },
  paymentMethodFilter = 'all',
  salesPersonFilter = 'all',
}: UseSalesStatsOptions) {
  const isLoadingRef = useRef(false);
  const hasFetchedRef = useRef(false);
  const lastParamsRef = useRef<string>('');
  
  const [stats, setStats] = useState({
    totalSales: 0,
    totalProfit: 0,
    totalCost: 0,
    totalDiscounts: 0,
    averageTransaction: 0,
    profitMargin: 0,
    transactionCount: 0,
    loading: true,
    error: null as string | null,
    filteredSales: [] as Sale[],
    periodComparison: null as PeriodComparison | null,
    historicalData: [] as HistoricalData[],
    topProducts: [] as TopPerformingProduct[],
    allTimeBest: {
      totalSales: 0,
      totalProfit: 0,
      bestDay: null as { date: string; amount: number } | null,
      bestMonth: null as { month: string; amount: number } | null,
    },
  });

  // Create a function that captures current parameters without dependencies
  const fetchStatsInternal = async () => {
    // Check if already loading using ref (immediate check)
    if (isLoadingRef.current) {
      return;
    }
    
    // Set loading state
    isLoadingRef.current = true;
    setStats((s) => ({ ...s, loading: true, error: null }));
    
    try {
      // Don't fetch stats if custom date filter is selected but no dates are provided
      if (dateFilter === 'custom' && (!customDateRange.startDate || !customDateRange.endDate)) {
        isLoadingRef.current = false; // Reset loading state
        setStats({
          totalSales: 0,
          totalProfit: 0,
          totalCost: 0,
          totalDiscounts: 0,
          averageTransaction: 0,
          profitMargin: 0,
          transactionCount: 0,
          loading: false,
          error: null,
          filteredSales: [],
          periodComparison: null,
          historicalData: [],
          topProducts: [],
          allTimeBest: {
            totalSales: 0,
            totalProfit: 0,
            bestDay: null,
            bestMonth: null,
          },
        });
        return;
      }
      
      let q = collection(db, 'sales');
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
          if (customDateRange.startDate && customDateRange.endDate) {
            const [yearStart, monthStart, dayStart] = customDateRange.startDate.split('-').map(Number);
            const [yearEnd, monthEnd, dayEnd] = customDateRange.endDate.split('-').map(Number);
            
            // Default full day range for custom dates
            startDate = new Date(yearStart, monthStart - 1, dayStart, 0, 0, 0, 0);
            endDate = new Date(yearEnd, monthEnd - 1, dayEnd, 23, 59, 59, 999);
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
      // El filtrado de fechas se hace en el cliente (ver más abajo)
      // if (startDate) constraints.push(where('createdAt', '>=', startDate.toISOString()));
      // if (endDate) constraints.push(where('createdAt', '<=', endDate.toISOString()));
      
      if (paymentMethodFilter !== 'all') {
        constraints.push(where('paymentMethod', '==', paymentMethodFilter));
      }

      if (salesPersonFilter !== 'all') {
        constraints.push(where('salesPersonId', '==', salesPersonFilter));
      }

      // No paginación, traemos todo lo que cumpla los filtros
      const qFinal = query(q, ...constraints);
      const snap = await getDocs(qFinal);
      const sales = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Sale[];

      // FILTRO DE FECHA EN CLIENTE (evita problemas de zona horaria)
      let filtered = sales.filter(sale => {
        // Ignorar ventas con timestamps corruptos
        if (sale.createdAt && sale.createdAt._methodName === 'serverTimestamp') {
          console.warn('⚠️ Venta con timestamp corrupto en stats, ignorando:', sale.id);
          return false;
        }

        // Aplicar filtro de fecha
        if (sale.createdAt && (startDate || endDate)) {
          let saleDate: Date;
          if (typeof sale.createdAt === 'string') {
            saleDate = new Date(sale.createdAt);
          } else if (sale.createdAt.toDate && typeof sale.createdAt.toDate === 'function') {
            saleDate = sale.createdAt.toDate();
          } else if (sale.createdAt.seconds) {
            saleDate = new Date(sale.createdAt.seconds * 1000);
          } else {
            saleDate = new Date(sale.createdAt);
          }

          if (startDate && saleDate < startDate) return false;
          if (endDate && saleDate > endDate) return false;
        }

        return true;
      });

      // Filtro de búsqueda (por producto, id o fecha seleccionada)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = sales.filter(sale => {
          // Buscar por id o producto
          const matchIdOrProduct = sale.id.toLowerCase().includes(term) ||
            (sale.items && sale.items.some((item: any) => item.productName?.toLowerCase().includes(term)));

          // Buscar por fecha seleccionada (si el término es una fecha)
          let matchDate = false;
          if (sale.createdAt) {
            let dateObj;
            // Firestore Timestamp (duck typing)
            if (
              typeof sale.createdAt === 'object' &&
              sale.createdAt !== null &&
              'seconds' in sale.createdAt &&
              typeof (sale.createdAt as any).seconds === 'number'
            ) {
              dateObj = new Date((sale.createdAt as any).seconds * 1000);
            } else {
              dateObj = new Date(sale.createdAt);
            }

            if (!isNaN(dateObj.getTime())) {
              const dateStr = dateObj.toLocaleDateString('es-CO');
              matchDate = dateStr.toLowerCase().includes(term);
            }
          }

          return matchIdOrProduct || matchDate;
        });
      }

      // Calcular stats
      const totalSales = filtered.reduce((sum, sale) => sum + (sale.finalTotal ?? sale.total ?? 0), 0);
      // Usar realProfit si hay cortesías, sino totalProfit
      const totalProfit = filtered.reduce((sum, sale) => {
        const hasCourtesies = sale.courtesyItems && sale.courtesyItems.length > 0;
        return sum + (hasCourtesies ? (sale.realProfit ?? 0) : (sale.totalProfit ?? 0));
      }, 0);
      // Usar realTotalCost si hay cortesías, sino totalCost
      const totalCost = filtered.reduce((sum, sale) => {
        const hasCourtesies = sale.courtesyItems && sale.courtesyItems.length > 0;
        return sum + (hasCourtesies ? (sale.realTotalCost ?? 0) : (sale.totalCost ?? 0));
      }, 0);
      const totalDiscounts = filtered.reduce((sum, sale) => sum + (sale.discount ?? 0), 0);
      const averageTransaction = filtered.length > 0 ? totalSales / filtered.length : 0;
      
      // Para el margen, solo considerar ventas que generan revenue (excluir entregas con total=0)
      const salesWithRevenue = filtered.filter(sale => (sale.finalTotal ?? sale.total ?? 0) > 0);
      const revenueForMargin = salesWithRevenue.reduce((sum, sale) => sum + (sale.finalTotal ?? sale.total ?? 0), 0);
      const profitMargin = revenueForMargin > 0 ? (totalProfit / revenueForMargin) * 100 : 0;

      // Calcular datos históricos y estadísticas avanzadas
      const calculateHistoricalData = (allSales: Sale[]) => {
        const dataByPeriod = new Map<string, HistoricalData>();
        
        allSales.forEach(sale => {
          let dateObj;
          if (typeof sale.createdAt === 'object' && sale.createdAt !== null && 'seconds' in sale.createdAt) {
            dateObj = new Date((sale.createdAt as any).seconds * 1000);
          } else {
            dateObj = new Date(sale.createdAt);
          }

          if (!isNaN(dateObj.getTime())) {
            const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
            const existing = dataByPeriod.get(monthKey) || {
              period: monthKey,
              totalSales: 0,
              totalProfit: 0,
              transactionCount: 0,
              profitMargin: 0,
            };

            const hasCourtesies = sale.courtesyItems && sale.courtesyItems.length > 0;
            existing.totalSales += sale.finalTotal ?? sale.total ?? 0;
            existing.totalProfit += hasCourtesies ? (sale.realProfit ?? 0) : (sale.totalProfit ?? 0);
            existing.transactionCount += 1;
            dataByPeriod.set(monthKey, existing);
          }
        });

        // Calcular márgenes de ganancia
        dataByPeriod.forEach((data) => {
          data.profitMargin = data.totalSales > 0 ? (data.totalProfit / data.totalSales) * 100 : 0;
        });

        return Array.from(dataByPeriod.values()).sort((a, b) => a.period.localeCompare(b.period));
      };

      const calculateTopProducts = (salesData: Sale[]) => {
        const productStats = new Map<string, TopPerformingProduct>();
        
        salesData.forEach(sale => {
          sale.items?.forEach((item: any) => {
            const existing = productStats.get(item.productId) || {
              productId: item.productId,
              productName: item.productName,
              totalSold: 0,
              totalRevenue: 0,
              totalProfit: 0,
            };

            existing.totalSold += item.quantity || 0;
            existing.totalRevenue += item.totalRevenue || 0;
            existing.totalProfit += item.profit || 0;
            productStats.set(item.productId, existing);
          });
        });

        return Array.from(productStats.values())
          .sort((a, b) => b.totalRevenue - a.totalRevenue)
          .slice(0, 10);
      };

      const calculateAllTimeBest = (allSales: Sale[]) => {
        const salesByDay = new Map<string, number>();
        const salesByMonth = new Map<string, number>();
        let totalAllTime = 0;
        let totalProfitAllTime = 0;

        allSales.forEach(sale => {
          const saleAmount = sale.finalTotal ?? sale.total ?? 0;
          totalAllTime += saleAmount;
          totalProfitAllTime += sale.totalProfit ?? 0;

          let dateObj;
          if (typeof sale.createdAt === 'object' && sale.createdAt !== null && 'seconds' in sale.createdAt) {
            dateObj = new Date((sale.createdAt as any).seconds * 1000);
          } else {
            dateObj = new Date(sale.createdAt);
          }

          if (!isNaN(dateObj.getTime())) {
            const dayKey = dateObj.toISOString().split('T')[0];
            const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
            
            salesByDay.set(dayKey, (salesByDay.get(dayKey) || 0) + saleAmount);
            salesByMonth.set(monthKey, (salesByMonth.get(monthKey) || 0) + saleAmount);
          }
        });

        // Encontrar el mejor día
        let bestDay: { date: string; amount: number } | null = null;
        salesByDay.forEach((amount, date) => {
          if (!bestDay || amount > bestDay.amount) {
            bestDay = { date, amount };
          }
        });

        // Encontrar el mejor mes
        let bestMonth: { month: string; amount: number } | null = null;
        salesByMonth.forEach((amount, month) => {
          if (!bestMonth || amount > bestMonth.amount) {
            bestMonth = { month, amount };
          }
        });

        return {
          totalSales: totalAllTime,
          totalProfit: totalProfitAllTime,
          bestDay,
          bestMonth,
        };
      };

      // ⚡ OPTIMIZADO: Calcular datos históricos SOLO con las ventas filtradas
      // NO hacer consultas adicionales - trabajar con lo que ya tenemos
      const historicalData = calculateHistoricalData(filtered);
      const topProducts = calculateTopProducts(filtered);
      const allTimeBest = calculateAllTimeBest(filtered);

      // ⚡ OPTIMIZADO: Comparación de períodos deshabilitada para reducir consultas
      // Si el usuario quiere comparar períodos, debe cambiar el filtro manualmente
      let periodComparison: PeriodComparison | null = null;
      // ⚡ DESHABILITADO: Comparación de períodos hace una consulta EXTRA muy costosa
      // Esto ahorra ~500+ lecturas por cada cambio de filtro
      // Si necesitas comparación, el usuario debe filtrar manualmente los 2 períodos

      setStats({
        totalSales,
        totalProfit,
        totalCost,
        totalDiscounts,
        averageTransaction,
        profitMargin,
        transactionCount: filtered.length,
        loading: false,
        error: null,
        filteredSales: filtered,
        periodComparison,
        historicalData,
        topProducts,
        allTimeBest,
      });
      isLoadingRef.current = false; // Reset loading state
    } catch (err: any) {
      isLoadingRef.current = false; // Reset loading state
      setStats((s) => ({ ...s, loading: false, error: err.message || 'Error al calcular totales' }));
    }
  };

  // Create stable fetchStats that doesn't change
  const fetchStats = useCallback(() => {
    fetchStatsInternal();
  }, []);
  

  // Clear stats immediately when switching to custom filter without complete date range
  useEffect(() => {
    if (dateFilter === 'custom' && (!customDateRange.startDate || !customDateRange.endDate)) {
      setStats({
        totalSales: 0,
        totalProfit: 0,
        totalCost: 0,
        totalDiscounts: 0,
        averageTransaction: 0,
        profitMargin: 0,
        transactionCount: 0,
        loading: false,
        error: null,
        filteredSales: [],
        periodComparison: null,
        historicalData: [],
        topProducts: [],
        allTimeBest: {
          totalSales: 0,
          totalProfit: 0,
          bestDay: null,
          bestMonth: null,
        },
      });
    }
  }, [dateFilter, customDateRange.startDate, customDateRange.endDate]);


  // Fetch initial stats when dependencies change (with debounce for search)
  useEffect(() => {
    const currentParams = JSON.stringify({
      searchTerm,
      dateFilter,
      startDate: customDateRange.startDate,
      endDate: customDateRange.endDate,
      timeRange,
      paymentMethodFilter,
      salesPersonFilter
    });
    
    // Only fetch if parameters actually changed
    if (currentParams === lastParamsRef.current && hasFetchedRef.current) {
      return;
    }
    
    lastParamsRef.current = currentParams;
    hasFetchedRef.current = true;
    
    if (searchTerm) {
      // Debounce search term changes
      const timer = setTimeout(() => {
        fetchStatsInternal();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      // Immediate fetch for other changes
      fetchStatsInternal();
    }
  }, [searchTerm, dateFilter, customDateRange.startDate, customDateRange.endDate, timeRange, paymentMethodFilter, salesPersonFilter]);

  // Retornar stats con función de refetch
  return { ...stats, refetch: fetchStats };
}
