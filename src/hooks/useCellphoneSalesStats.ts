import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Sale, Product, Category } from '../types';
import { useAppSelector } from './useAppSelector';

interface UseCellphoneSalesStatsOptions {
  searchTerm?: string;
  dateFilter?: string;
  customDateRange?: { startDate: string; endDate: string };
  timeRange?: { startTime: string; endTime: string };
  paymentMethodFilter?: string;
  salesPersonFilter?: string;
}

interface CellphoneSalesStats {
  totalSales: number;
  totalProfit: number;
  totalCost: number;
  totalDiscounts: number;
  averageTransaction: number;
  profitMargin: number;
  transactionCount: number;
  loading: boolean;
  error: string | null;
}

// Corrige fechas tipo 'YYYY-MM-DD' para zona local
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function useCellphoneSalesStats({
  searchTerm = '',
  dateFilter = 'today',
  customDateRange = { startDate: '', endDate: '' },
  timeRange = { startTime: '', endTime: '' },
  paymentMethodFilter = 'all',
  salesPersonFilter = 'all',
}: UseCellphoneSalesStatsOptions) {
  const [stats, setStats] = useState<CellphoneSalesStats>({
    totalSales: 0,
    totalProfit: 0,
    totalCost: 0,
    totalDiscounts: 0,
    averageTransaction: 0,
    profitMargin: 0,
    transactionCount: 0,
    loading: true,
    error: null,
  });

  // ⚡ OPTIMIZADO: Usar datos de Redux en lugar de consultar Firebase
  const products = useAppSelector(state => state.firebase.products.items);
  const categories = useAppSelector(state => state.firebase.categories.items);

  const fetchStats = useCallback(async () => {
    setStats((s) => ({ ...s, loading: true, error: null }));

    try {
      // Don't fetch stats if custom date filter is selected but no dates are provided
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
        });
        return;
      }

      // ⚡ OPTIMIZADO: Usar datos de Redux - ahorra ~150 lecturas por consulta
      
      
      // Encontrar categoría de celulares
      const cellphoneCategory = categories.find(cat => {
        const name = cat.name.toLowerCase();
        return name.includes('celular') || 
               name.includes('móvil') || 
               name.includes('movil') ||
               name.includes('teléfono') || 
               name.includes('telefono') ||
               name.includes('phone') ||
               name.includes('smartphone');
      });
      
      
      // Obtener IDs de productos de celulares
      const cellphoneProductIds = cellphoneCategory ? 
        products.filter(product => product.categoryId === cellphoneCategory.id).map(p => p.id) : 
        [];

      if (cellphoneProductIds.length === 0) {
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
      // El filtrado de fechas se hace en el cliente
      // if (startDate) constraints.push(where('createdAt', '>=', startDate.toISOString()));
      // if (endDate) constraints.push(where('createdAt', '<=', endDate.toISOString()));
      
      if (paymentMethodFilter !== 'all') {
        constraints.push(where('paymentMethod', '==', paymentMethodFilter));
      }

      if (salesPersonFilter !== 'all') {
        constraints.push(where('salesPersonId', '==', salesPersonFilter));
      }

      const qFinal = query(q, ...constraints);
      const snap = await getDocs(qFinal);
      let sales = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Sale[];

      // FILTRO DE FECHA EN CLIENTE (evita problemas de zona horaria)
      sales = sales.filter(sale => {
        // Ignorar ventas con timestamps corruptos
        if (sale.createdAt && sale.createdAt._methodName === 'serverTimestamp') {
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

      // Filtrar ventas que contengan productos de celulares y calcular solo esos items
      let cellphoneSales = 0;
      let cellphoneProfit = 0;
      let cellphoneCost = 0;
      let cellphoneDiscounts = 0;
      let cellphoneTransactions = 0;

      sales.forEach(sale => {
        // Excluir abonos a plan separe (solo ventas reales)
        if (sale.isLayaway || sale.type === 'layaway_payment') {
          return;
        }

        // Verificar si esta venta tiene items de celulares
        const cellphoneItems = sale.items?.filter((item: any) =>
          cellphoneProductIds.includes(item.productId)
        ) || [];

        if (cellphoneItems.length > 0) {
          // Calcular solo los valores de los items de celulares
          const itemsSales = cellphoneItems.reduce((sum, item) => sum + (item.totalRevenue || 0), 0);
          const itemsProfit = cellphoneItems.reduce((sum, item) => sum + (item.profit || 0), 0);
          const itemsCost = cellphoneItems.reduce((sum, item) => sum + (item.totalCost || 0), 0);
          
          // Para descuentos y recargos, prorratear según el porcentaje de celulares en la venta
          const saleTotal = sale.items?.reduce((sum, item) => sum + (item.totalRevenue || 0), 0) || 0;
          let cellphoneDiscountForThisSale = 0;
          let cellphoneSurchargeForThisSale = 0;
          
          if (saleTotal > 0) {
            const cellphonePercentage = itemsSales / saleTotal;
            cellphoneDiscountForThisSale = (sale.discount || 0) * cellphonePercentage;
            cellphoneDiscounts += cellphoneDiscountForThisSale;
            
            // Incluir parte proporcional del recargo por método de pago
            cellphoneSurchargeForThisSale = (sale.customerSurcharge || 0) * cellphonePercentage;
          }
          
          // Calcular ventas netas (después del descuento proporcional + recargo proporcional)
          const netSales = itemsSales - cellphoneDiscountForThisSale + cellphoneSurchargeForThisSale;
          cellphoneSales += netSales;
          
          // La ganancia se recalcula con las ventas netas
          const netProfit = netSales - itemsCost;
          cellphoneProfit += netProfit;
          cellphoneCost += itemsCost;
          
          cellphoneTransactions += 1;
        }
      });

      // Filtro de búsqueda adicional si es necesario
      if (searchTerm) {
        // Aquí podrías agregar lógica adicional de filtrado por término de búsqueda
        // Por ahora, mantenemos los resultados como están
      }

      const averageTransaction = cellphoneTransactions > 0 ? cellphoneSales / cellphoneTransactions : 0;
      const profitMargin = cellphoneSales > 0 ? (cellphoneProfit / cellphoneSales) * 100 : 0;


      setStats({
        totalSales: cellphoneSales,
        totalProfit: cellphoneProfit,
        totalCost: cellphoneCost,
        totalDiscounts: cellphoneDiscounts,
        averageTransaction,
        profitMargin,
        transactionCount: cellphoneTransactions,
        loading: false,
        error: null,
      });

    } catch (err: any) {
      console.error('Error en estadísticas de celulares:', err);
      setStats((s) => ({ ...s, loading: false, error: err.message || 'Error al calcular estadísticas de celulares' }));
    }
  }, [searchTerm, dateFilter, customDateRange.startDate, customDateRange.endDate, timeRange.startTime, timeRange.endTime, paymentMethodFilter, salesPersonFilter, products, categories]);

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
      });
    }
  }, [dateFilter, customDateRange.startDate, customDateRange.endDate]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { ...stats, refetch: fetchStats };
}