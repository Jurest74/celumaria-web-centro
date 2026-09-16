// Compras, devoluciones de venta y ajustes manuales de inventario.
import { beforeEach, describe, expect, it } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { productsService, purchasesService, salesService } from '../../src/services/firebase/firestore';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import { processProductReturn } from '../../src/store/thunks/salesThunks';
import type { Purchase, Sale } from '../../src/types';
import { crearCliente, crearProducto, crearStore, limpiarEmulador, linea, saldoDe, stockDe, ventaRegular } from './ayudas';

beforeEach(limpiarEmulador);

function compra(productId: string, nombre: string, cantidad: number, costo: number, stockPrevio: number) {
  return {
    items: [{
      productId,
      productName: nombre,
      quantity: cantidad,
      purchasePrice: costo,
      totalCost: costo * cantidad,
      previousStock: stockPrevio,
      previousPurchasePrice: 0,
      newSalePrice: 0,
      previousSalePrice: 0,
    }],
    totalCost: costo * cantidad,
    totalItems: cantidad,
  } as Omit<Purchase, 'id' | 'createdAt'>;
}

describe('Compras', () => {
  it('suma al stock y recalcula el costo promedio ponderado', async () => {
    const funda = await crearProducto('Funda', 10, 1000, 5000);

    await purchasesService.add(compra(funda.id, 'Funda', 10, 2000, 10));

    const producto = (await getDoc(doc(db, COLLECTIONS.PRODUCTS, funda.id))).data()!;
    expect(producto.stock).toBe(20);
    // (10 × 1.000 + 10 × 2.000) / 20 = 1.500
    expect(producto.purchasePrice).toBe(1500);
  });

  it('borrar la compra revierte las unidades que agregó', async () => {
    const funda = await crearProducto('Funda', 10, 1000, 5000);
    const id = await purchasesService.add(compra(funda.id, 'Funda', 8, 1000, 10));
    expect(await stockDe(funda.id)).toBe(18);

    await purchasesService.delete(id);

    expect(await stockDe(funda.id)).toBe(10);
  });
});

describe('Devolución de un producto vendido', () => {
  it('regresa las unidades al stock y recalcula la venta', async () => {
    const funda = await crearProducto('Funda', 10, 60000, 100000);
    const saleId = await salesService.add(ventaRegular([linea(funda, 3)]));
    const store = crearStore();

    await store.dispatch(processProductReturn({ saleId, productId: funda.id, returnQuantity: 1 })).unwrap();

    expect(await stockDe(funda.id)).toBe(8);
    const venta = (await getDoc(doc(db, COLLECTIONS.SALES, saleId))).data() as Sale;
    expect(venta.items[0].quantity).toBe(2);
    expect(venta.total).toBe(200000);
    expect(venta.totalProfit).toBe(80000);
  });

  it('si se abona al saldo a favor, el cliente recibe exactamente lo devuelto', async () => {
    const funda = await crearProducto('Funda', 10, 60000, 100000);
    const clienteId = await crearCliente('Ana', 5000);
    const saleId = await salesService.add(ventaRegular([linea(funda, 2)], { customerId: clienteId }));
    const store = crearStore();

    await store.dispatch(processProductReturn({
      saleId, productId: funda.id, returnQuantity: 1, creditCustomerId: clienteId, refundAmount: 100000
    })).unwrap();

    expect(await saldoDe(clienteId)).toBe(105000);
    expect(await stockDe(funda.id)).toBe(9);
  });

  it('no deja devolver más de lo vendido', async () => {
    const funda = await crearProducto('Funda', 10);
    const saleId = await salesService.add(ventaRegular([linea(funda, 2)]));
    const store = crearStore();

    await expect(
      store.dispatch(processProductReturn({ saleId, productId: funda.id, returnQuantity: 3 })).unwrap()
    ).rejects.toThrow();
    expect(await stockDe(funda.id)).toBe(8);
  });
});

describe('Ajuste manual de inventario', () => {
  it('editar datos del producto sin tocar el stock no pisa una venta hecha mientras tanto', async () => {
    const funda = await crearProducto('Funda', 10);
    // El administrador abre el formulario viendo stock 10; en caja se venden 2.
    await salesService.add(ventaRegular([linea(funda, 2)]));

    // Guarda el cambio de precio (el formulario ya no envía el stock).
    await productsService.update(funda.id, { salePrice: 120000 });

    expect(await stockDe(funda.id)).toBe(8);
  });

  it('un conteo manual sobre un stock que cambió se rechaza sin guardar nada', async () => {
    const funda = await crearProducto('Funda', 10);
    await salesService.add(ventaRegular([linea(funda, 2)]));

    // El formulario se abrió viendo 10 y el administrador escribe 15.
    await expect(productsService.ajustarStock(funda.id, 10, 15)).rejects.toThrow(/cambió mientras lo editabas/);
    expect(await stockDe(funda.id)).toBe(8);
  });

  it('un conteo manual sobre el stock vigente se guarda', async () => {
    const funda = await crearProducto('Funda', 10);

    const anterior = await productsService.ajustarStock(funda.id, 10, 15);

    expect(anterior).toBe(10);
    expect(await stockDe(funda.id)).toBe(15);
  });
});
