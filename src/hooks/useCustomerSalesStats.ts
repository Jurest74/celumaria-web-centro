import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Sale, Product, Category } from '../types';
import { startOfDayBogota, endOfDayBogota, subtractDaysBogota, bogotaDateKey } from '../utils/dateUtils';

interface CustomerSalesOptions {
  customerId?: string;
  dateFilter?: 'thisMonth' | 'lastMonth' | 'last3Months' | 'last6Months' | 'thisYear' | 'lastYear' | 'allTime';
  startDate?: string;
  endDate?: string;
}

interface CustomerSalesPeriod {
  period: string;
  totalSales: number;
  totalProfit: number;
  transactionCount: number;
  averageTransaction: number;
}

interface CustomerSalesStats {
  totalSales: number;
  totalProfit: number;
  transactionCount: number;
  averageTransaction: number;
  bestMonth: { month: string; amount: number } | null;
  bestDay: { date: string; amount: number } | null;
  monthlyData: CustomerSalesPeriod[];
  yearlyData: CustomerSalesPeriod[];
  allTimeRanking: number;
  loading: boolean;
  error: string | null;
}

export function useCustomerSalesStats({
  customerId,
  dateFilter = 'allTime',
  startDate,
  endDate
}: CustomerSalesOptions) {
  const [stats, setStats] = useState<CustomerSalesStats>({
    totalSales: 0,
    totalProfit: 0,
    transactionCount: 0,
    averageTransaction: 0,
    bestMonth: null,
    bestDay: null,
    monthlyData: [],
    yearlyData: [],
    allTimeRanking: 0,
    loading: true,
    error: null,
  });

  const getDateRange = useCallback(() => {
    // Rango ISO UTC en día calendario Colombia (TZ-independiente)
    let startISO: string | null = null;
    let endISO: string | null = null;
    const todayKey = bogotaDateKey();
    const [tY, tM] = todayKey.split('-').map(Number);

    switch (dateFilter) {
      case 'thisMonth': {
        const startKey = `${todayKey.slice(0, 7)}-01`;
        startISO = startOfDayBogota(startKey);
        endISO   = endOfDayBogota(todayKey);
        break;
      }
      case 'lastMonth': {
        const lastY = tM === 1 ? tY - 1 : tY;
        const lastM = tM === 1 ? 12 : tM - 1;
        const lastMKey = `${lastY}-${String(lastM).padStart(2, '0')}-01`;
        const daysInLast = new Date(Date.UTC(tY, tM - 1, 0)).getUTCDate();
        const lastDayKey = `${lastY}-${String(lastM).padStart(2, '0')}-${String(daysInLast).padStart(2, '0')}`;
        startISO = startOfDayBogota(lastMKey);
        endISO   = endOfDayBogota(lastDayKey);
        break;
      }
      case 'last3Months':
        startISO = startOfDayBogota(subtractDaysBogota(90));
        endISO   = endOfDayBogota(todayKey);
        break;
      case 'last6Months':
        startISO = startOfDayBogota(subtractDaysBogota(180));
        endISO   = endOfDayBogota(todayKey);
        break;
      case 'thisYear':
        startISO = startOfDayBogota(`${tY}-01-01`);
        endISO   = endOfDayBogota(`${tY}-12-31`);
        break;
      case 'lastYear':
        startISO = startOfDayBogota(`${tY - 1}-01-01`);
        endISO   = endOfDayBogota(`${tY - 1}-12-31`);
        break;
      case 'allTime':
        break;
    }

    // Override con fechas personalizadas si se proporcionan
    if (startDate && endDate) {
      startISO = startOfDayBogota(startDate);
      endISO   = endOfDayBogota(endDate);
    }

    return { startISO, endISO };
  }, [dateFilter, startDate, endDate]);

  const fetchCustomerStats = useCallback(async () => {
    if (!customerId) {
      setStats(prev => ({ ...prev, loading: false }));
      return;
    }

    setStats(prev => ({ ...prev, loading: true, error: null }));

    try {
      const { startISO, endISO } = getDateRange();

      // Query base para el cliente
      let constraints: any[] = [where('customerId', '==', customerId)];

      // Agregar filtros de fecha si aplican
      if (startISO) constraints.push(where('createdAt', '>=', startISO));
      if (endISO)   constraints.push(where('createdAt', '<=', endISO));

      const customerQuery = query(
        collection(db, 'sales'),
        ...constraints,
        orderBy('createdAt', 'desc')
      );

      const customerSnap = await getDocs(customerQuery);
      const customerSales = customerSnap.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      })) as Sale[];

      // ⚡ OPTIMIZADO: NO consultar todas las ventas para ranking
      // El ranking es costoso y no es crítico para la funcionalidad principal

      // Calcular estadísticas básicas del cliente
      const totalSales = customerSales.reduce((sum, sale) => sum + (sale.total ?? 0), 0);
      const totalProfit = customerSales.reduce((sum, sale) => sum + (sale.totalProfit ?? 0), 0);
      const transactionCount = customerSales.length;
      const averageTransaction = transactionCount > 0 ? totalSales / transactionCount : 0;

      // Calcular mejor día y mes
      const salesByDay = new Map<string, number>();
      const salesByMonth = new Map<string, number>();

      customerSales.forEach(sale => {
        let dateObj;
        if (typeof sale.createdAt === 'object' && sale.createdAt !== null && 'seconds' in sale.createdAt) {
          dateObj = new Date((sale.createdAt as any).seconds * 1000);
        } else {
          dateObj = new Date(sale.createdAt);
        }

        if (!isNaN(dateObj.getTime())) {
          const dayKey = bogotaDateKey(dateObj);   // día calendario Colombia
          const monthKey = dayKey.slice(0, 7);     // "YYYY-MM" Colombia

          salesByDay.set(dayKey, (salesByDay.get(dayKey) || 0) + (sale.total ?? 0));
          salesByMonth.set(monthKey, (salesByMonth.get(monthKey) || 0) + (sale.total ?? 0));
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

      // Calcular datos mensuales (últimos 12 meses solamente, en calendario Colombia)
      const todayKeyForMonths = bogotaDateKey();
      const [tYear, tMonth] = todayKeyForMonths.split('-').map(Number);
      // Mes 12 atrás respecto al mes actual Colombia
      const cutoffYear = tMonth - 11 <= 0 ? tYear - 1 : tYear;
      const cutoffMonth = ((tMonth - 11) + 12 - 1) % 12 + 1; // 1..12
      const twelveMonthsAgoKey = `${cutoffYear}-${String(cutoffMonth).padStart(2, '0')}`;

      const monthlyData: CustomerSalesPeriod[] = Array.from(salesByMonth.entries())
        .map(([period, totalSales]) => {
          // period = "YYYY-MM" Colombia
          if (period < twelveMonthsAgoKey) return null;

          const monthSales = customerSales.filter(sale => {
            let dateObj;
            if (typeof sale.createdAt === 'object' && sale.createdAt !== null && 'seconds' in sale.createdAt) {
              dateObj = new Date((sale.createdAt as any).seconds * 1000);
            } else {
              dateObj = new Date(sale.createdAt);
            }
            const monthKey = bogotaDateKey(dateObj).slice(0, 7);
            return monthKey === period;
          });
          
          const monthProfit = monthSales.reduce((sum, sale) => sum + (sale.totalProfit ?? 0), 0);
          const monthCount = monthSales.length;
          
          return {
            period,
            totalSales,
            totalProfit: monthProfit,
            transactionCount: monthCount,
            averageTransaction: monthCount > 0 ? totalSales / monthCount : 0
          };
        })
        .filter(data => data !== null)
        .sort((a, b) => a.period.localeCompare(b.period));

      // Calcular datos anuales (solo este año y el año pasado)
      const currentYear = Number(bogotaDateKey().slice(0, 4));
      const lastYear = currentYear - 1;
      
      const salesByYear = new Map<string, { total: number; profit: number; count: number }>();
      customerSales.forEach(sale => {
        let dateObj;
        if (typeof sale.createdAt === 'object' && sale.createdAt !== null && 'seconds' in sale.createdAt) {
          dateObj = new Date((sale.createdAt as any).seconds * 1000);
        } else {
          dateObj = new Date(sale.createdAt);
        }

        if (!isNaN(dateObj.getTime())) {
          const year = Number(bogotaDateKey(dateObj).slice(0, 4));
          
          // Solo incluir este año y el año pasado
          if (year === currentYear || year === lastYear) {
            const yearKey = year.toString();
            const existing = salesByYear.get(yearKey) || { total: 0, profit: 0, count: 0 };
            existing.total += sale.total ?? 0;
            existing.profit += sale.totalProfit ?? 0;
            existing.count += 1;
            salesByYear.set(yearKey, existing);
          }
        }
      });

      const yearlyData: CustomerSalesPeriod[] = Array.from(salesByYear.entries())
        .map(([period, data]) => ({
          period,
          totalSales: data.total,
          totalProfit: data.profit,
          transactionCount: data.count,
          averageTransaction: data.count > 0 ? data.total / data.count : 0
        }))
        .sort((a, b) => a.period.localeCompare(b.period));

      // ⚡ OPTIMIZADO: Ranking deshabilitado - requiere consultar TODAS las ventas
      // Esto ahorraba ~500+ lecturas cada vez que se abre un cliente
      const allTimeRanking = 0; // Deshabilitado para optimización

      setStats({
        totalSales,
        totalProfit,
        transactionCount,
        averageTransaction,
        bestMonth,
        bestDay,
        monthlyData,
        yearlyData,
        allTimeRanking,
        loading: false,
        error: null,
      });

    } catch (error: any) {
      setStats(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message || 'Error al cargar estadísticas del cliente' 
      }));
    }
  }, [customerId, getDateRange]);

  useEffect(() => {
    fetchCustomerStats();
  }, [fetchCustomerStats]);

  return { ...stats, refetch: fetchCustomerStats };
}