import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, writeBatch, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from '../../services/firebase/collections';
import { updateSale as updateFirebaseSale, deleteSale as deleteFirebaseSale, updateProductStock as updateFirebaseProductStock } from '../slices/firebaseSlice';
import { Sale, SaleItem } from '../../types';
import { salesCalculations } from '../../utils/calculations';
import { recalcularTrasDevolucion } from '../../utils/salesCalculations';
import { salesService } from '../../services/firebase/firestore';
import { getColombiaTimestamp } from '../../utils/dateUtils';

// NOTA: El thunk antiguo `processSale` fue retirado.
// Sólo despachaba reducers en memoria (addFirebaseSale + updateProductStock)
// sin persistir en Firestore. Las ventas reales se crean directamente con
// `salesService.add(...)` desde Sales.tsx, Layaway.tsx y TechnicalService.tsx.

export const processProductReturn = createAsyncThunk(
  'sales/processProductReturn',
  async (
    { 
      saleId, 
      productId, 
      returnQuantity,
      creditCustomerId,
      refundAmount
    }: { 
      saleId: string; 
      productId: string; 
      returnQuantity: number; 
      // Cuando la devolucion se abona al saldo del cliente, entra en el mismo
      // batch: o quedan la devolucion y el saldo, o no queda ninguno.
      creditCustomerId?: string;
      refundAmount?: number;
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

    // Recalcular totales de la venta.
    // recalcularTrasDevolucion baja el recargo y la comision en la misma
    // proporcion que el total. Sin esto quedaban con el valor previo a la
    // devolucion: finalTotal no bajaba nunca y los reportes, que leen
    // finalTotal || total, seguian contando la plata devuelta como ingreso.
    const recalculatedSale = salesCalculations.calculateSaleTotal(updatedItems, sale.discount);
    const ajustado = recalcularTrasDevolucion(sale, {
      total: recalculatedSale.total,
      totalCost: recalculatedSale.totalCost,
    });

    // Crear objeto de venta actualizada
    const updatedSaleData = {
      items: updatedItems,
      subtotal: recalculatedSale.subtotal,
      total: ajustado.total,
      totalCost: ajustado.totalCost,
      totalProfit: ajustado.totalProfit,
      profitMargin: ajustado.profitMargin,
      totalCommissions: ajustado.totalCommissions,
      customerSurcharge: ajustado.customerSurcharge,
      finalTotal: ajustado.finalTotal
    };

    // Actualización atómica en Firestore: ambas operaciones en un mismo batch.
    // Se usa increment() para que el stock no dependa del valor en Redux
    // (que puede estar desactualizado y producir un set absoluto erróneo).
    const batch = writeBatch(db);
    const saleRef = doc(db, COLLECTIONS.SALES, saleId);
    const productRef = doc(db, COLLECTIONS.PRODUCTS, productId);

    batch.update(saleRef, {
      ...updatedSaleData,
      updatedAt: getColombiaTimestamp()
    });
    batch.update(productRef, {
      stock: increment(returnQuantity),
      updatedAt: getColombiaTimestamp()
    });

    // El saldo se suma con increment, no con un valor absoluto calculado en el
    // cliente: leer el saldo de Redux y escribir el total pisaba cualquier
    // cambio hecho entremedio (otra devolucion, una venta que use el saldo).
    if (creditCustomerId && refundAmount && refundAmount > 0) {
      batch.update(doc(db, COLLECTIONS.CUSTOMERS, creditCustomerId), {
        credit: increment(refundAmount),
        updatedAt: getColombiaTimestamp()
      });
    }

    await batch.commit();

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

    // Delete from Firebase (this will also restore product stock automatically
    // for ventas regulares; las de tipo layaway_*/technical_service_* no tocan stock)
    await salesService.delete(saleId);

    // Update local state - remove sale
    dispatch(deleteFirebaseSale(saleId));

    // Sólo refrescar el stock local si la venta efectivamente lo descontó —
    // esto debe ser simétrico con la lógica de salesService.add/.delete.
    const affectedStock = !sale.type || sale.type === 'regular';
    if (affectedStock) {
      sale.items.forEach((item: SaleItem) => {
        dispatch(updateFirebaseProductStock({
          productId: item.productId,
          quantityChange: item.quantity // Add back the sold quantity
        }));
      });
      // Cortesías de la venta también se restauran en Firestore — reflejarlas en Redux
      const courtesyItems = (sale as any).courtesyItems;
      if (Array.isArray(courtesyItems)) {
        courtesyItems.forEach((c: any) => {
          if (c.productId) {
            dispatch(updateFirebaseProductStock({
              productId: c.productId,
              quantityChange: c.quantity
            }));
          }
        });
      }
    }

    return { saleId, deletedSale: sale };
  }
);