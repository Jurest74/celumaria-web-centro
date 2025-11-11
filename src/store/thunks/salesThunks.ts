import { createAsyncThunk } from '@reduxjs/toolkit';
import { addSale as addFirebaseSale, updateSale as updateFirebaseSale, deleteSale as deleteFirebaseSale, updateProductStock as updateFirebaseProductStock } from '../slices/firebaseSlice';
import { Sale, SaleItem } from '../../types';
import { salesCalculations } from '../../utils/calculations';
import { salesService, productsService } from '../../services/firebase/firestore';

export const processSale = createAsyncThunk(
  'sales/processSale',
  async (
    saleData: Omit<Sale, 'id' | 'createdAt'>,
    { dispatch }
  ) => {
    // Add the sale
    dispatch(addFirebaseSale(saleData));
    
    // Update product stock for each item
    saleData.items.forEach(item => {
      dispatch(updateFirebaseProductStock({
        productId: item.productId,
        quantityChange: -item.quantity
      }));
    });

    return saleData;
  }
);

export const processProductReturn = createAsyncThunk(
  'sales/processProductReturn',
  async (
    { 
      saleId, 
      productId, 
      returnQuantity 
    }: { 
      saleId: string; 
      productId: string; 
      returnQuantity: number; 
    },
    { dispatch, getState }
  ) => {
    const state = getState() as any;
    const sale = state.firebase.sales.items.find((s: Sale) => s.id === saleId);
    
    if (!sale) {
      throw new Error('Venta no encontrada');
    }

    const itemIndex = sale.items.findIndex((item: SaleItem) => item.productId === productId);
    if (itemIndex === -1) {
      throw new Error('Producto no encontrado en la venta');
    }

    const item = sale.items[itemIndex];
    if (returnQuantity > item.quantity) {
      throw new Error('No se puede devolver más cantidad de la vendida');
    }

    // Crear nueva lista de items actualizados
    const updatedItems = [...sale.items];
    
    if (returnQuantity === item.quantity) {
      // Remover el item completamente si se devuelve toda la cantidad
      updatedItems.splice(itemIndex, 1);
    } else {
      // Actualizar la cantidad del item
      const newQuantity = item.quantity - returnQuantity;
      updatedItems[itemIndex] = {
        ...item,
        quantity: newQuantity,
        totalCost: item.purchasePrice * newQuantity,
        totalRevenue: item.salePrice * newQuantity,
        profit: (item.salePrice * newQuantity) - (item.purchasePrice * newQuantity)
      };
    }

    // Recalcular totales de la venta
    const recalculatedSale = salesCalculations.calculateSaleTotal(updatedItems, sale.discount);
    
    // Crear objeto de venta actualizada
    const updatedSaleData = {
      items: updatedItems,
      subtotal: recalculatedSale.subtotal,
      total: recalculatedSale.total,
      totalCost: recalculatedSale.totalCost,
      totalProfit: recalculatedSale.totalProfit,
      profitMargin: recalculatedSale.profitMargin
    };

    // Actualizar en Firebase primero
    await salesService.update(saleId, updatedSaleData);
    
    // Actualizar stock del producto en Firebase
    const currentProduct = state.firebase.products.items.find((p: any) => p.id === productId);
    if (currentProduct) {
      await productsService.update(productId, {
        stock: currentProduct.stock + returnQuantity
      });
    }
    
    // Actualizar el estado local de Redux
    dispatch(updateFirebaseSale({
      id: saleId,
      updates: updatedSaleData
    }));

    // Devolver stock al inventario en el estado local
    dispatch(updateFirebaseProductStock({
      productId,
      quantityChange: returnQuantity
    }));

    return {
      saleId,
      productId,
      returnQuantity,
      updatedSale: {
        ...sale,
        items: updatedItems,
        ...recalculatedSale
      }
    };
  }
);

export const deleteSale = createAsyncThunk(
  'sales/deleteSale',
  async (saleId: string, { dispatch, getState }) => {
    const state = getState() as any;
    const sale = state.firebase.sales.items.find((s: Sale) => s.id === saleId);
    
    if (!sale) {
      throw new Error('Venta no encontrada');
    }

    // Delete from Firebase (this will also restore product stock automatically)
    await salesService.delete(saleId);
    
    // Update local state - remove sale
    dispatch(deleteFirebaseSale(saleId));
    
    // Update local product stock for each item
    sale.items.forEach((item: SaleItem) => {
      dispatch(updateFirebaseProductStock({
        productId: item.productId,
        quantityChange: item.quantity // Add back the sold quantity
      }));
    });

    return { saleId, deletedSale: sale };
  }
);