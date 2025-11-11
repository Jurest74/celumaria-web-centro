import { useState } from 'react';
import { Purchase, PurchaseReturn, PurchaseReturnItem } from '../types';
import { doc, arrayUnion, increment, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';

export function usePurchaseReturns() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createReturn = async (
    purchase: Purchase,
    returnItems: PurchaseReturnItem[],
    reason?: string,
    notes?: string
  ): Promise<{ success: boolean; error?: string; returnId?: string }> => {
    if (!purchase.id || returnItems.length === 0) {
      return { success: false, error: 'Datos de devolución inválidos' };
    }

    setLoading(true);
    setError(null);

    try {
      const batch = writeBatch(db);
      
      // Crear el objeto de devolución
      const returnId = `return_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const totalRefund = returnItems.reduce((sum, item) => sum + item.totalRefund, 0);
      const totalReturnedItems = returnItems.reduce((sum, item) => sum + item.returnedQuantity, 0);

      const purchaseReturn: PurchaseReturn = {
        id: returnId,
        purchaseId: purchase.id,
        items: returnItems,
        totalRefund,
        totalReturnedItems,
        reason,
        createdAt: new Date().toISOString(),
        notes
      };

      // Actualizar la compra con la devolución
      const purchaseRef = doc(db, 'purchases', purchase.id);
      const currentTotalReturned = purchase.totalReturned || 0;
      const newTotalReturned = currentTotalReturned + totalRefund;
      const newNetCost = (purchase.totalCost || 0) - newTotalReturned;

      batch.update(purchaseRef, {
        returns: arrayUnion(purchaseReturn),
        totalReturned: newTotalReturned,
        netCost: newNetCost,
        updatedAt: new Date().toISOString()
      });

      // Actualizar el stock de cada producto devuelto
      for (const returnItem of returnItems) {
        // Reducir el stock (porque se devuelve mercancía)
        const productRef = doc(db, 'products', returnItem.productId);
        batch.update(productRef, {
          stock: increment(-returnItem.returnedQuantity),
          updatedAt: new Date().toISOString()
        });

        // Recalcular el precio promedio de compra si es necesario
        // Esto es complejo porque necesitamos considerar todas las compras previas
        // Por ahora, mantenemos el precio actual pero podríamos implementar
        // un recálculo más sofisticado más adelante
      }

      await batch.commit();

      setLoading(false);
      return { success: true, returnId };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al procesar devolución';
      setError(errorMessage);
      setLoading(false);
      return { success: false, error: errorMessage };
    }
  };

  const validateReturnItems = (
    purchase: Purchase,
    returnItems: PurchaseReturnItem[]
  ): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!purchase.id) {
      errors.push('Compra inválida');
      return { isValid: false, errors };
    }

    if (returnItems.length === 0) {
      errors.push('Debe seleccionar al menos un producto para devolver');
      return { isValid: false, errors };
    }

    for (const returnItem of returnItems) {
      // Encontrar el item original en la compra
      const originalItem = purchase.items.find(item => item.productId === returnItem.productId);
      if (!originalItem) {
        errors.push(`Producto ${returnItem.productName} no encontrado en la compra original`);
        continue;
      }

      // Calcular cuánto ya se ha devuelto de este producto
      const previousReturns = purchase.returns || [];
      const totalPreviouslyReturned = previousReturns.reduce((sum, ret) => {
        const returnedItem = ret.items.find(item => item.productId === returnItem.productId);
        return sum + (returnedItem?.returnedQuantity || 0);
      }, 0);

      const maxReturnableQuantity = originalItem.quantity - totalPreviouslyReturned;

      if (returnItem.returnedQuantity <= 0) {
        errors.push(`La cantidad a devolver de ${returnItem.productName} debe ser mayor a 0`);
      } else if (returnItem.returnedQuantity > maxReturnableQuantity) {
        errors.push(
          `No se puede devolver ${returnItem.returnedQuantity} unidades de ${returnItem.productName}. ` +
          `Máximo disponible para devolución: ${maxReturnableQuantity}`
        );
      }

      // Validar que el precio coincida
      if (Math.abs(returnItem.purchasePrice - originalItem.purchasePrice) > 0.01) {
        errors.push(`El precio de ${returnItem.productName} no coincide con la compra original`);
      }
    }

    return { isValid: errors.length === 0, errors };
  };

  const getReturnableQuantity = (purchase: Purchase, productId: string): number => {
    const originalItem = purchase.items.find(item => item.productId === productId);
    if (!originalItem) return 0;

    const previousReturns = purchase.returns || [];
    const totalPreviouslyReturned = previousReturns.reduce((sum, ret) => {
      const returnedItem = ret.items.find(item => item.productId === productId);
      return sum + (returnedItem?.returnedQuantity || 0);
    }, 0);

    return originalItem.quantity - totalPreviouslyReturned;
  };

  const getTotalReturned = (purchase: Purchase): number => {
    return purchase.totalReturned || 0;
  };

  const getNetCost = (purchase: Purchase): number => {
    return purchase.netCost || purchase.totalCost || 0;
  };

  return {
    createReturn,
    validateReturnItems,
    getReturnableQuantity,
    getTotalReturned,
    getNetCost,
    loading,
    error
  };
}
