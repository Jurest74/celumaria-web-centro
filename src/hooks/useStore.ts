import { useState, useMemo, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { Product, Sale, DashboardStats, LayawayPlan, LayawayPayment, LayawayItem } from '../types';

export function useStore() {
  const [products, setProducts] = useLocalStorage<Product[]>('store-products', []);
  const [sales, setSales] = useLocalStorage<Sale[]>('store-sales', []);
  const [layawayPlans, setLayawayPlans] = useLocalStorage<LayawayPlan[]>('store-layaways', []);

  const addProduct = (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newProduct: Product = {
      ...product,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setProducts(prev => [...prev, newProduct]);
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(product => 
      product.id === id 
        ? { ...product, ...updates, updatedAt: new Date().toISOString() }
        : product
    ));
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(product => product.id !== id));
  };

  const addSale = (sale: Omit<Sale, 'id' | 'createdAt'>) => {
    const newSale: Sale = {
      ...sale,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    
    // Update product stock
    setProducts(prevProducts => {
      return prevProducts.map(product => {
        const saleItem = sale.items.find(item => item.productId === product.id);
        if (saleItem) {
          return {
            ...product,
            stock: Math.max(0, product.stock - saleItem.quantity),
            updatedAt: new Date().toISOString()
          };
        }
        return product;
      });
    });
    
    setSales(prev => [...prev, newSale]);
  };

  const createLayaway = (layaway: Omit<LayawayPlan, 'id' | 'createdAt' | 'updatedAt' | 'payments' | 'remainingBalance'>) => {
    // Convert items to new format with individual unit tracking
    const itemsWithTracking = layaway.items.map(item => ({
      ...item,
      pickedUpQuantity: 0,
      pickedUpHistory: []
    }));

    const newLayaway: LayawayPlan = {
      ...layaway,
      items: itemsWithTracking,
      id: crypto.randomUUID(),
      payments: layaway.downPayment > 0 ? [{
        id: crypto.randomUUID(),
        amount: layaway.downPayment,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'efectivo',
        notes: 'Pago inicial'
      }] : [],
      remainingBalance: layaway.totalAmount - layaway.downPayment,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Reserve product stock for all items
    setProducts(prevProducts => {
      return prevProducts.map(product => {
        const layawayItem = layaway.items.find(item => item.productId === product.id);
        if (layawayItem) {
          return {
            ...product,
            stock: Math.max(0, product.stock - layawayItem.quantity),
            updatedAt: new Date().toISOString()
          };
        }
        return product;
      });
    });

    setLayawayPlans(prev => [...prev, newLayaway]);
  };

  const addLayawayPayment = (layawayId: string, payment: Omit<LayawayPayment, 'id'>) => {
    const newPayment: LayawayPayment = {
      ...payment,
      id: crypto.randomUUID(),
    };

    setLayawayPlans(prev => prev.map(layaway => {
      if (layaway.id === layawayId) {
        const newRemainingBalance = Math.max(0, layaway.remainingBalance - payment.amount);
        const updatedLayaway = {
          ...layaway,
          payments: [...layaway.payments, newPayment],
          remainingBalance: newRemainingBalance,
          status: newRemainingBalance === 0 ? 'completed' as const : layaway.status,
          updatedAt: new Date().toISOString(),
        };
        return updatedLayaway;
      }
      return layaway;
    }));
  };

  const updateLayaway = (id: string, updates: Partial<LayawayPlan>) => {
    setLayawayPlans(prev => prev.map(layaway => {
      if (layaway.id === id) {
        const updatedLayaway = { 
          ...layaway, 
          ...updates, 
          updatedAt: new Date().toISOString() 
        };

        // If cancelling, return stock to inventory for unpicked items
        if (updates.status === 'cancelled' && layaway.status !== 'cancelled') {
          setProducts(prevProducts => {
            return prevProducts.map(product => {
              const layawayItem = (layaway.items || []).find(item => item.productId === product.id);
              if (layawayItem) {
                const unpickedQuantity = layawayItem.quantity - (layawayItem.pickedUpQuantity || 0);
                if (unpickedQuantity > 0) {
                  return {
                    ...product,
                    stock: product.stock + unpickedQuantity,
                    updatedAt: new Date().toISOString()
                  };
                }
              }
              return product;
            });
          });
        }

        return updatedLayaway;
      }
      return layaway;
    }));
  };

  const markUnitsAsPickedUp = (layawayId: string, itemId: string, quantityToPickUp: number, notes?: string) => {
    setLayawayPlans(prev => prev.map(layaway => {
      if (layaway.id === layawayId) {
        const updatedItems = (layaway.items || []).map(item => {
          if (item.id === itemId) {
            const currentPickedUp = item.pickedUpQuantity || 0;
            const maxCanPickUp = item.quantity - currentPickedUp;
            const actualQuantityToPickUp = Math.min(quantityToPickUp, maxCanPickUp);
            
            if (actualQuantityToPickUp > 0) {
              const newPickupRecord = {
                id: crypto.randomUUID(),
                quantity: actualQuantityToPickUp,
                date: new Date().toISOString(),
                notes
              };

              return {
                ...item,
                pickedUpQuantity: currentPickedUp + actualQuantityToPickUp,
                pickedUpHistory: [...(item.pickedUpHistory || []), newPickupRecord]
              };
            }
          }
          return item;
        });

        return {
          ...layaway,
          items: updatedItems,
          updatedAt: new Date().toISOString()
        };
      }
      return layaway;
    }));
  };

  // Migration function to update existing layaway plans
  const migrateLayawayPlans = () => {
    setLayawayPlans(prev => prev.map(layaway => ({
      ...layaway,
      items: (layaway.items || []).map(item => ({
        ...item,
        pickedUpQuantity: item.pickedUpQuantity ?? (item.pickedUp ? item.quantity : 0),
        pickedUpHistory: item.pickedUpHistory ?? (item.pickedUp ? [{
          id: crypto.randomUUID(),
          quantity: item.quantity,
          date: item.pickedUpDate || new Date().toISOString(),
          notes: item.pickedUpNotes
        }] : [])
      }))
    })));
  };

  // Run migration on first load
  useEffect(() => {
    const hasOldFormat = layawayPlans.some(layaway => 
      (layaway.items || []).some(item => 
        item.pickedUpQuantity === undefined && item.pickedUp !== undefined
      )
    );
    
    if (hasOldFormat) {
      migrateLayawayPlans();
    }
  }, [layawayPlans]);

  const dashboardStats = useMemo((): DashboardStats => {
    const today = new Date().toDateString();
    const todaysSales = sales.filter(sale => 
      new Date(sale.createdAt).toDateString() === today
    );
    
    const activeLayaways = layawayPlans.filter(l => l.status === 'active').length;
    const layawayRevenue = layawayPlans.reduce((sum, layaway) => 
      sum + (layaway.totalAmount - layaway.remainingBalance), 0
    );

    // Separar ventas regulares de abonos y entregas de layaway para cálculo correcto
    const regularSales = sales.filter(sale => !sale.type || sale.type === 'regular');
    const layawayPayments = sales.filter(sale => sale.type === 'layaway_payment');
    
    // Total de ventas = ventas regulares + abonos (sin duplicar en entregas)
    const totalSales = [...regularSales, ...layawayPayments].reduce((sum, sale) => sum + sale.total, 0);
    
    // Costos y ganancias incluyen todos los tipos
    const totalCost = sales.reduce((sum, sale) => sum + sale.totalCost, 0);
    const totalProfit = sales.reduce((sum, sale) => sum + sale.totalProfit, 0);
    
    // Margen basado en el costo total (más preciso)
    const averageProfitMargin = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    // Calculate inventory values
    const inventoryValue = products.reduce((sum, product) => 
      sum + (product.stock * product.purchasePrice), 0
    );
    const potentialRevenue = products.reduce((sum, product) => 
      sum + (product.stock * product.salePrice), 0
    );
    
    return {
      totalSales,
      totalProducts: products.length,
      lowStockCount: products.filter(product => product.stock <= 5).length,
      todaysSales: todaysSales.reduce((sum, sale) => sum + sale.total, 0),
      todaysTransactions: todaysSales.length,
      activeLayaways,
      layawayRevenue,
      totalCost,
      totalProfit,
      averageProfitMargin,
      inventoryValue,
      potentialRevenue,
    };
  }, [products, sales, layawayPlans]);

  return {
    products,
    sales,
    layawayPlans,
    addProduct,
    updateProduct,
    deleteProduct,
    addSale,
    createLayaway,
    addLayawayPayment,
    updateLayaway,
    markUnitsAsPickedUp,
    dashboardStats,
  };
}