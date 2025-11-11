import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Sale, Product, Category } from '../types';

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
    const today = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    switch (dateFilter) {
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'last3Months':
        start = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        end = today;
        break;
      case 'last6Months':
        start = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000);
        end = today;
        break;
      case 'thisYear':
        start = new Date(today.getFullYear(), 0, 1);
        end = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      case 'lastYear':
        start = new Date(today.getFullYear() - 1, 0, 1);
        end = new Date(today.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        break;
      case 'allTime':
        // Sin filtro de fecha
        break;
    }

    // Override con fechas personalizadas si se proporcionan
    if (startDate && endDate) {
      const [yearStart, monthStart, dayStart] = startDate.split('-').map(Number);
      const [yearEnd, monthEnd, dayEnd] = endDate.split('-').map(Number);
      start = new Date(yearStart, monthStart - 1, dayStart, 0, 0, 0, 0);
      end = new Date(yearEnd, monthEnd - 1, dayEnd, 23, 59, 59, 999);
    }

    return { start, end };
  }, [dateFilter, startDate, endDate]);

  const fetchCustomerStats = useCallback(async () => {
    if (!customerId) {
      setStats(prev => ({ ...prev, loading: false }));
      return;
    }

    setStats(prev => ({ ...prev, loading: true, error: null }));

    try {
      const { start, end } = getDateRange();
      
      // Query base para el cliente
      let constraints: any[] = [where('customerId', '==', customerId)];
      
      // Agregar filtros de fecha si aplican
      if (start) constraints.push(where('createdAt', '>=', start.toISOString()));
      if (end) constraints.push(where('createdAt', '<=', end.toISOString()));

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
          const dayKey = dateObj.toISOString().split('T')[0];
          const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
          
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

      // Calcular datos mensuales (últimos 12 meses solamente)
      const now = new Date();
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      
      const monthlyData: CustomerSalesPeriod[] = Array.from(salesByMonth.entries())
        .map(([period, totalSales]) => {
          // Filtrar solo los últimos 12 meses
          const [year, month] = period.split('-').map(Number);
          const periodDate = new Date(year, month - 1);
          
          if (periodDate < twelveMonthsAgo) {
            return null;
          }
          
          const monthSales = customerSales.filter(sale => {
            let dateObj;
            if (typeof sale.createdAt === 'object' && sale.createdAt !== null && 'seconds' in sale.createdAt) {
              dateObj = new Date((sale.createdAt as any).seconds * 1000);
            } else {
              dateObj = new Date(sale.createdAt);
            }
            const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
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
      const currentYear = now.getFullYear();
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
          const year = dateObj.getFullYear();
          
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