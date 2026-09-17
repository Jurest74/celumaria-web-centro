import { useState } from 'react';
import { Purchase, PurchaseReturn, PurchaseReturnItem } from '../types';
import { doc, arrayUnion, increment, runTransaction } from 'firebase/firestore';
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

      // Compra, stock y validaciones en una sola transacción, sobre el dato
      // guardado. Antes se escribía desde la compra que tenía la pantalla y sin
      // mirar el stock: se podían devolver al proveedor unidades que ya se
      // habían vendido y el inventario quedaba en negativo.
      await runTransaction(db, async (tx) => {
        const purchaseRef = doc(db, 'purchases', purchase.id);
        const compraSnap = await tx.get(purchaseRef);
        if (!compraSnap.exists()) {
          throw new Error('La compra ya no existe.');
        }
        const compra = { id: compraSnap.id, ...compraSnap.data() } as Purchase;

        // Todas las lecturas antes de escribir.
        const stockPorProducto = new Map<string, number>();
        for (const returnItem of returnItems) {
          const productoSnap = await tx.get(doc(db, 'products', returnItem.productId));
          if (!productoSnap.exists()) {
            throw new Error(`El producto ${returnItem.productName} ya no existe en el inventario.`);
          }
          stockPorProducto.set(returnItem.productId, Number(productoSnap.data().stock || 0));
        }

        for (const returnItem of returnItems) {
          // Lo que queda por devolver según la compra guardada (otra devolución
          // pudo registrarse desde otro equipo).
          const original = compra.items.find(item => item.productId === returnItem.productId);
          const yaDevuelto = (compra.returns || []).reduce((sum, ret) =>
            sum + (ret.items.find(item => item.productId === returnItem.productId)?.returnedQuantity || 0), 0);
          const devolvible = (original?.quantity || 0) - yaDevuelto;
          if (returnItem.returnedQuantity > devolvible) {
            throw new Error(
              `De ${returnItem.productName} solo quedan ${devolvible} unidad(es) por devolver de esta compra.`
            );
          }

          // Regla del negocio: no se devuelve al proveedor lo que ya no está en la tienda.
          const enTienda = stockPorProducto.get(returnItem.productId) || 0;
          if (returnItem.returnedQuantity > enTienda) {
            throw new Error(
              `Solo hay ${enTienda} unidad(es) de ${returnItem.productName} en la tienda; ` +
              `no se pueden devolver ${returnItem.returnedQuantity}.`
            );
          }
        }

        const totalDevueltoAntes = compra.totalReturned || 0;
        tx.update(purchaseRef, {
          returns: arrayUnion(purchaseReturn),
          totalReturned: totalDevueltoAntes + totalRefund,
          netCost: (compra.totalCost || 0) - (totalDevueltoAntes + totalRefund),
          updatedAt: new Date().toISOString()
        });

        for (const returnItem of returnItems) {
          tx.update(doc(db, 'products', returnItem.productId), {
            stock: increment(-returnItem.returnedQuantity),
            updatedAt: new Date().toISOString()
          });
        }
      });

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
