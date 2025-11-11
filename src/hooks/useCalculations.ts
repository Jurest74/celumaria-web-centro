// 🎯 Hook personalizado para cálculos optimizados
import { useMemo } from 'react';
import { useAppSelector } from './useAppSelector';
import { selectProducts, selectSales, selectLayaways, selectCustomers, selectCategories } from '../store/selectors';
import { calculations } from '../utils/calculations';
import type { DashboardStats } from '../types';

// Hook para estadísticas del dashboard (memoizado)
export function useDashboardCalculations(): DashboardStats | null {
  const products = useAppSelector(selectProducts);
  const sales = useAppSelector(selectSales);
  const layaways = useAppSelector(selectLayaways);
  const customers = useAppSelector(selectCustomers);
  const categories = useAppSelector(selectCategories);

  // ✅ Memoización: solo recalcula cuando cambian los datos
  const stats = useMemo(() => {
    if (!products.length && !sales.length) {
      return null; // Datos aún cargando
    }

    return calculations.dashboard.calculateDashboardStats(
      products,
      sales,
      layaways,
      customers,
      categories
    );
  }, [products, sales, layaways, customers, categories]);

  return stats;
}

// Hook para cálculos de ventas
export function useSalesCalculations() {
  const sales = useAppSelector(selectSales);
  const products = useAppSelector(selectProducts);

  return useMemo(() => ({
    // Ventas de hoy
    todaysSales: calculations.sales.getTodaysSales(sales),
    
    // Top productos
    topProducts: calculations.sales.getTopSellingProducts(sales, products, 5),
    
    // Estadísticas generales
    overallStats: calculations.sales.calculateSalesStats(sales),
    
    // Función para calcular total de venta
    calculateSaleTotal: calculations.sales.calculateSaleTotal,
  }), [sales, products]);
}

// Hook para cálculos de inventario
export function useInventoryCalculations() {
  const products = useAppSelector(selectProducts);

  return useMemo(() => ({
    // Valor del inventario
    inventoryValue: calculations.products.calculateInventoryValue(products),
    
    // Ingresos potenciales
    potentialRevenue: calculations.products.calculatePotentialRevenue(products),
    
    // Productos con poco stock
    lowStockProducts: calculations.products.getLowStockProducts(products),
    
    // Funciones de cálculo
    calculateMargin: calculations.products.calculateMargin,
    calculateProfit: calculations.products.calculateProfit,
  }), [products]);
}

// Hook para cálculos de reportes
export function useReportsCalculations() {
  const sales = useAppSelector(selectSales);
  const products = useAppSelector(selectProducts);

  return useMemo(() => {
    // Ventas por día (últimos 7 días)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toDateString();
    }).reverse();

    const salesByDay = last7Days.map(dateString => {
      const daySales = sales.filter(sale => 
        new Date(sale.createdAt).toDateString() === dateString
      );
      
      return {
        date: dateString,
        sales: daySales.length,
        revenue: daySales.reduce((sum, sale) => sum + sale.total, 0),
        profit: daySales.reduce((sum, sale) => sum + sale.totalProfit, 0)
      };
    });

    // Ventas por categoría
    const salesByCategory: Record<string, { revenue: number; profit: number; count: number }> = {};
    
    sales.forEach(sale => {
      sale.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        const category = product?.category || 'Sin categoría';
        
        if (!salesByCategory[category]) {
          salesByCategory[category] = { revenue: 0, profit: 0, count: 0 };
        }
        
        salesByCategory[category].revenue += item.totalRevenue;
        salesByCategory[category].profit += item.profit;
        salesByCategory[category].count += item.quantity;
      });
    });

    return {
      salesByDay,
      salesByCategory: Object.entries(salesByCategory).map(([category, data]) => ({
        category,
        ...data
      })),
      topProducts: calculations.sales.getTopSellingProducts(sales, products, 10)
    };
  }, [sales, products]);
}