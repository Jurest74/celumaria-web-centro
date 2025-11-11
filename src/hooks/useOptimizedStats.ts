import { useState, useMemo } from 'react';
import { useAppSelector } from './useAppSelector';
import { selectProducts } from '../store/selectors';
import type { DashboardStats } from '../types';
import calculations from '../utils/calculations';

// 🎯 Hook optimizado que NO carga todo
export function useOptimizedDashboardStats(): DashboardStats | null {
  const [cachedStats, setCachedStats] = useState<DashboardStats | null>(null);
  const [lastCalculated, setLastCalculated] = useState<number>(0);
  
  // Solo datos esenciales, no todo
  const products = useAppSelector(selectProducts);
  const recentSales = useAppSelector(state => 
    state.firebase.sales.items.slice(-100) // Solo últimas 100 ventas
  );

  // ✅ Cálculo optimizado con cache
  const stats = useMemo(() => {
    const now = Date.now();
    const CACHE_TIME = 5 * 60 * 1000; // 5 minutos
    
    // Si tenemos cache reciente, usarlo
    if (cachedStats && (now - lastCalculated) < CACHE_TIME) {
      return cachedStats;
    }

    // Calcular solo con datos necesarios
    const today = new Date().toDateString();
    const todaysSales = recentSales.filter(sale => 
      new Date(sale.createdAt).toDateString() === today
    );

    // Usar totalProfit directamente de las ventas (ya calculado correctamente)
    const totalSales = recentSales.reduce((sum, sale) => sum + (sale.finalTotal || sale.total), 0);
    const totalProfit = recentSales.reduce((sum, sale) => sum + (sale.totalProfit ?? 0), 0);
    const inventoryValue = products.reduce((sum, product) => 
      sum + (product.stock * product.purchasePrice), 0
    );

    const newStats: DashboardStats = {
      totalSales,
      totalProducts: products.length,
      lowStockCount: products.filter(p => p.stock <= 5).length,
      todaysSales: todaysSales.reduce((sum, sale) => sum + sale.total, 0),
      todaysTransactions: todaysSales.length,
      activeLayaways: 0, // Calculado por separado
      layawayRevenue: 0,
      totalCost: recentSales.reduce((sum, sale) => sum + sale.totalCost, 0),
      totalProfit,
      averageProfitMargin: (() => {
        const salesWithRevenue = recentSales.filter(sale => (sale.finalTotal || sale.total) > 0);
        const revenueForMargin = salesWithRevenue.reduce((sum, sale) => sum + (sale.finalTotal || sale.total), 0);
        return revenueForMargin > 0 ? (totalProfit / revenueForMargin) * 100 : 0;
      })(),
      inventoryValue,
      potentialRevenue: products.reduce((sum, product) => 
        sum + (product.stock * product.salePrice), 0
      ),
      totalCustomers: 0, // Calculado por separado
      totalCategories: 0,
    };

    // Guardar en cache
    setCachedStats(newStats);
    setLastCalculated(now);
    
    return newStats;
  }, [products, recentSales, cachedStats, lastCalculated]);

  return stats;
}

// 🚀 Hook para cargar datos por demanda
export function useOnDemandData() {
  const [isLoadingFullData, setIsLoadingFullData] = useState(false);
  const [fullStats, setFullStats] = useState<any>(null);

  const loadFullStats = async () => {
    setIsLoadingFullData(true);
    try {
      // Solo cuando el usuario lo pida explícitamente
      // Por ejemplo, al ir a la página de reportes
      const allSales = await getAllSalesOptimized();
      // Usar el cálculo de dashboard para stats globales
      // Si tienes productos, layaways, customers, categories, pásalos aquí
      // Aquí solo tenemos ventas, así que parchamos solo totalProfit, totalSales, totalCost, averageProfitMargin
      // Usar totalProfit directamente de las ventas (ya calculado correctamente)
      let totalProfit = 0;
      let totalSales = 0;
      let totalCost = 0;
      allSales.forEach(sale => {
        totalSales += sale.total ?? 0;
        totalCost += sale.totalCost ?? 0;
        totalProfit += sale.totalProfit ?? 0;
      });
      
      // Para el margen, solo considerar ventas con revenue
      const salesWithRevenue = allSales.filter(sale => (sale.total ?? 0) > 0);
      const revenueForMargin = salesWithRevenue.reduce((sum, sale) => sum + (sale.total ?? 0), 0);
      
      const calculatedStats = {
        totalProfit,
        totalSales,
        totalCost,
        averageProfitMargin: revenueForMargin > 0 ? (totalProfit / revenueForMargin) * 100 : 0
      };
      
      console.log('🧮 Cálculo de margen:', {
        totalProfit,
        totalSales,
        revenueForMargin,
        margin: calculatedStats.averageProfitMargin,
        salesWithRevenue: salesWithRevenue.length
      });
      setFullStats(calculatedStats);
    } finally {
      setIsLoadingFullData(false);
    }
  };

  return { fullStats, isLoadingFullData, loadFullStats };
}

// Función optimizada para cargar ventas
async function getAllSalesOptimized() {
  // Cargar por páginas para no sobrecargar
  const pageSize = 100;
  let allSales: any[] = [];
  let hasMore = true;
  let lastDoc = null;

  while (hasMore && allSales.length < 1000) { // Límite de seguridad
    const { data, lastDoc: newLastDoc } = await getPaginatedSales(pageSize, lastDoc);
    allSales = [...allSales, ...data];
    lastDoc = newLastDoc;
    hasMore = data.length === pageSize;
  }

  return allSales;
}