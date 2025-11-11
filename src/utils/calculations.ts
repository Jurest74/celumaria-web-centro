// 🧮 CÁLCULOS OPTIMIZADOS PARA FRONTEND
// Todos estos cálculos son GRATIS - no consumen cuota Firebase

import type { Product, Sale, LayawayPlan, DashboardStats } from '../types';

// ✅ Cálculos de productos (instantáneos)
export const productCalculations = {
  // Calcular margen de ganancia
  calculateMargin(purchasePrice: number, salePrice: number): number {
    if (salePrice <= 0) return 0;
    return ((salePrice - purchasePrice) / salePrice) * 100;
  },

  // Calcular ganancia unitaria
  calculateProfit(purchasePrice: number, salePrice: number): number {
    return Math.max(0, salePrice - purchasePrice);
  },

  // Valor total del inventario
  calculateInventoryValue(products: Product[]): number {
    return products.reduce((total, product) => 
      total + (product.stock * product.purchasePrice), 0
    );
  },

  // Ingresos potenciales
  calculatePotentialRevenue(products: Product[]): number {
    return products.reduce((total, product) => 
      total + (product.stock * product.salePrice), 0
    );
  },

  // Productos con poco stock
  getLowStockProducts(products: Product[], threshold: number = 5): Product[] {
    return products.filter(product => product.stock <= threshold && product.stock > 0);
  }
};

// ✅ Cálculos de ventas (optimizados)
export const salesCalculations = {
  // Calcular totales de una venta
  calculateSaleTotal(items: any[], discount: number = 0) {
    const subtotal = items.reduce((sum, item) => sum + item.totalRevenue, 0);
    const totalCost = items.reduce((sum, item) => sum + item.totalCost, 0);
    const appliedDiscount = Math.min(discount, subtotal);
    const total = subtotal - appliedDiscount;
    const totalProfit = total - totalCost;
    const profitMargin = total > 0 ? (totalProfit / total) * 100 : 0;
    
    return { subtotal, appliedDiscount, total, totalCost, totalProfit, profitMargin };
  },

  // Estadísticas de ventas por período
  calculateSalesStats(sales: Sale[], startDate?: Date, endDate?: Date) {
    const filteredSales = sales.filter(sale => {
      const saleDate = new Date(sale.createdAt);
      if (startDate && saleDate < startDate) return false;
      if (endDate && saleDate > endDate) return false;
      return true;
    });

    const totalSales = filteredSales.reduce((sum, sale) => sum + (sale.finalTotal || sale.total), 0);
    const totalCost = filteredSales.reduce((sum, sale) => sum + (sale.totalCost || 0), 0);
    const totalProfit = filteredSales.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);
    const averageTransaction = filteredSales.length > 0 ? totalSales / filteredSales.length : 0;
    
    // Para el margen, solo considerar ventas que generan revenue (excluir entregas con total=0)
    const salesWithRevenue = filteredSales.filter(sale => (sale.finalTotal || sale.total) > 0);
    const revenueForMargin = salesWithRevenue.reduce((sum, sale) => sum + (sale.finalTotal || sale.total), 0);
    const profitMargin = revenueForMargin > 0 ? (totalProfit / revenueForMargin) * 100 : 0;

    return {
      totalSales,
      totalCost,
      totalProfit,
      averageTransaction,
      profitMargin,
      transactionCount: filteredSales.length
    };
  },

  // Ventas de hoy
  getTodaysSales(sales: Sale[]): Sale[] {
    const today = new Date().toDateString();
    return sales.filter(sale =>
      new Date(sale.createdAt).toDateString() === today
    );
  },

  // Calcular ventas del día segregadas por tipo (para cuadre de caja)
  getTodaysSalesBreakdown(sales: Sale[]) {
    const todaysSales = this.getTodaysSales(sales);

    let cellphones = 0;
    let otherProducts = 0;
    let technicalServices = 0;
    let layawayPayments = 0;

    todaysSales.forEach(sale => {
      const saleAmount = sale.finalTotal || sale.total;

      // Servicios técnicos
      if (sale.type === 'technical_service_payment') {
        technicalServices += saleAmount;
        return;
      }

      // Abonos a plan separe
      if (sale.type === 'layaway_payment') {
        layawayPayments += saleAmount;
        return;
      }

      // Entregas de plan separe (no cuentan como ingreso nuevo)
      if (sale.type === 'layaway_delivery') {
        return;
      }

      // Ventas regulares: separar celulares de otros productos
      if (sale.type === 'regular' || !sale.type) {
        sale.items.forEach(item => {
          const itemTotal = item.totalRevenue;

          // Verificar si es un celular
          if (item.category && item.category.toLowerCase().includes('celular')) {
            cellphones += itemTotal;
          } else {
            otherProducts += itemTotal;
          }
        });

        // Si hay descuento, prorratearlo proporcionalmente
        if (sale.discount > 0) {
          const subtotal = sale.subtotal;
          if (subtotal > 0) {
            const discountRatio = sale.discount / subtotal;
            cellphones -= (sale.items
              .filter(item => item.category && item.category.toLowerCase().includes('celular'))
              .reduce((sum, item) => sum + item.totalRevenue, 0) * discountRatio);
            otherProducts -= (sale.items
              .filter(item => !item.category || !item.category.toLowerCase().includes('celular'))
              .reduce((sum, item) => sum + item.totalRevenue, 0) * discountRatio);
          }
        }
      }
    });

    const total = cellphones + otherProducts + technicalServices + layawayPayments;

    return {
      total,
      cellphones,
      otherProducts,
      technicalServices,
      layawayPayments,
      percentages: {
        cellphones: total > 0 ? (cellphones / total) * 100 : 0,
        otherProducts: total > 0 ? (otherProducts / total) * 100 : 0,
        technicalServices: total > 0 ? (technicalServices / total) * 100 : 0,
        layawayPayments: total > 0 ? (layawayPayments / total) * 100 : 0,
      },
      transactionCount: todaysSales.length
    };
  },

  // Top productos vendidos
  getTopSellingProducts(sales: Sale[], products: Product[], limit: number = 5) {
    const productSales: Record<string, { 
      product: Product; 
      totalSold: number; 
      totalRevenue: number; 
      totalProfit: number; 
    }> = {};

    // Agregar datos de ventas
    sales.forEach(sale => {
      sale.items.forEach(item => {
        if (!productSales[item.productId]) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            productSales[item.productId] = {
              product,
              totalSold: 0,
              totalRevenue: 0,
              totalProfit: 0
            };
          }
        }
        
        if (productSales[item.productId]) {
          productSales[item.productId].totalSold += item.quantity;
          productSales[item.productId].totalRevenue += item.totalRevenue;
          productSales[item.productId].totalProfit += item.profit;
        }
      });
    });

    return Object.values(productSales)
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, limit);
  }
};

// ✅ Cálculos de dashboard (tiempo real)
export const dashboardCalculations = {
  // Calcular todas las estadísticas del dashboard
  calculateDashboardStats(
    products: Product[],
    sales: Sale[],
    layaways: LayawayPlan[],
    customers: any[],
    categories: any[]
  ): DashboardStats {
    const todaysSales = salesCalculations.getTodaysSales(sales);
    const activeLayaways = layaways.filter(l => l.status === 'active');
    
    const layawayRevenue = layaways.reduce((sum, layaway) => 
      sum + (layaway.totalAmount - layaway.remainingBalance), 0
    );

    const salesStats = salesCalculations.calculateSalesStats(sales);
    const inventoryValue = productCalculations.calculateInventoryValue(products);
    const potentialRevenue = productCalculations.calculatePotentialRevenue(products);
    const lowStockCount = productCalculations.getLowStockProducts(products).length;

    return {
      totalSales: salesStats.totalSales,
      totalProducts: products.length,
      lowStockCount,
      todaysSales: todaysSales.reduce((sum, sale) => sum + (sale.finalTotal || sale.total), 0),
      todaysTransactions: todaysSales.length,
      activeLayaways: activeLayaways.length,
      layawayRevenue,
      totalCost: salesStats.totalCost,
      totalProfit: salesStats.totalProfit,
      averageProfitMargin: salesStats.profitMargin,
      inventoryValue,
      potentialRevenue,
      totalCustomers: customers.length,
      totalCategories: categories.filter(c => c.isActive).length,
    };
  },

  // Cálculos en tiempo real (se ejecutan cuando cambian los datos)
  recalculateStats(state: any) {
    const { products, sales, layaways, customers, categories } = state.firebase;
    
    return this.calculateDashboardStats(
      products.items,
      sales.items,
      layaways.items,
      customers.items,
      categories.items
    );
  }
};

// ✅ Utilidades de optimización
export const optimizationUtils = {
  // Debounce para cálculos pesados
  debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  },

  // Memoización simple para cálculos repetitivos
  memoize<T extends (...args: any[]) => any>(func: T): T {
    const cache = new Map();
    return ((...args: any[]) => {
      const key = JSON.stringify(args);
      if (cache.has(key)) {
        return cache.get(key);
      }
      const result = func(...args);
      cache.set(key, result);
      return result;
    }) as T;
  },

  // Calcular solo cuando sea necesario
  shouldRecalculate(prevData: any[], newData: any[]): boolean {
    return prevData.length !== newData.length || 
           JSON.stringify(prevData) !== JSON.stringify(newData);
  }
};

// ✅ Exportar todo
export const calculations = {
  products: productCalculations,
  sales: salesCalculations,
  dashboard: dashboardCalculations,
  utils: optimizationUtils
};

export default calculations;