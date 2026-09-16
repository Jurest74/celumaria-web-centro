// Ventas e inventario: el stock debe quedar exacto después de vender, borrar
// ventas y vender al mismo tiempo desde dos cajas.
import { beforeEach, describe, expect, it } from 'vitest';
import { salesService } from '../../src/services/firebase/firestore';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import { StockInsuficienteError } from '../../src/utils/stock';
import { cortesia, crearProducto, documentos, limpiarEmulador, linea, stockDe, ventaRegular } from './ayudas';

beforeEach(limpiarEmulador);

describe('Venta regular', () => {
  it('descuenta del stock exactamente lo vendido', async () => {
    const funda = await crearProducto('Funda', 10);
    const cargador = await crearProducto('Cargador', 5);

    await salesService.add(ventaRegular([linea(funda, 3), linea(cargador, 1)]));

    expect(await stockDe(funda.id)).toBe(7);
    expect(await stockDe(cargador.id)).toBe(4);
    expect(await documentos(COLLECTIONS.SALES)).toHaveLength(1);
  });

  it('si no alcanza el stock, falla y no deja ni venta ni descuento', async () => {
    const funda = await crearProducto('Funda', 2);
    const vidrio = await crearProducto('Vidrio', 10);

    await expect(
      salesService.add(ventaRegular([linea(vidrio, 1), linea(funda, 3)]))
    ).rejects.toBeInstanceOf(StockInsuficienteError);

    expect(await stockDe(funda.id)).toBe(2);
    expect(await stockDe(vidrio.id)).toBe(10);
    expect(await documentos(COLLECTIONS.SALES)).toHaveLength(0);
  });

  it('la cortesía descuenta del mismo inventario y cuenta para la verificación', async () => {
    const funda = await crearProducto('Funda', 3);

    // 2 vendidas + 2 de cortesía = 4 > 3: no cabe.
    await expect(
      salesService.add(ventaRegular([linea(funda, 2)], { courtesyItems: [cortesia(funda, 2)] }))
    ).rejects.toBeInstanceOf(StockInsuficienteError);
    expect(await stockDe(funda.id)).toBe(3);

    await salesService.add(ventaRegular([linea(funda, 2)], { courtesyItems: [cortesia(funda, 1)] }));
    expect(await stockDe(funda.id)).toBe(0);
  });

  it('dos cajas vendiendo la última unidad al mismo tiempo: solo una pasa', async () => {
    const celular = await crearProducto('Celular', 1, 500000, 800000);

    const resultados = await Promise.allSettled([
      salesService.add(ventaRegular([linea(celular, 1)], { salesPersonName: 'Caja 1' })),
      salesService.add(ventaRegular([linea(celular, 1)], { salesPersonName: 'Caja 2' })),
    ]);

    expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stockDe(celular.id)).toBe(0);
    expect(await documentos(COLLECTIONS.SALES)).toHaveLength(1);
  });

  it('los abonos y pagos de servicio no tocan el stock', async () => {
    const funda = await crearProducto('Funda', 5);

    await salesService.add(ventaRegular([{ ...linea(funda, 0), quantity: 0 }], { type: 'layaway_payment' }));
    await salesService.add(ventaRegular([], { type: 'technical_service_payment', total: 50000 }));

    expect(await stockDe(funda.id)).toBe(5);
  });
});

describe('Borrar venta', () => {
  it('devuelve al stock lo vendido y las cortesías', async () => {
    const funda = await crearProducto('Funda', 10);
    const vidrio = await crearProducto('Vidrio', 10);
    const id = await salesService.add(ventaRegular([linea(funda, 4)], { courtesyItems: [cortesia(vidrio, 2)] }));
    expect(await stockDe(funda.id)).toBe(6);
    expect(await stockDe(vidrio.id)).toBe(8);

    await salesService.delete(id);

    expect(await stockDe(funda.id)).toBe(10);
    expect(await stockDe(vidrio.id)).toBe(10);
    expect(await documentos(COLLECTIONS.SALES)).toHaveLength(0);
  });

  it('borrar la misma venta desde dos equipos devuelve el stock una sola vez', async () => {
    const funda = await crearProducto('Funda', 10);
    const id = await salesService.add(ventaRegular([linea(funda, 3)]));

    const resultados = await Promise.allSettled([salesService.delete(id), salesService.delete(id)]);

    expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stockDe(funda.id)).toBe(10);
  });

  it('borrar un abono no devuelve stock', async () => {
    const funda = await crearProducto('Funda', 5);
    const id = await salesService.add(ventaRegular([linea(funda, 2)], { type: 'layaway_payment' }));

    await salesService.delete(id);

    expect(await stockDe(funda.id)).toBe(5);
  });

  it('un producto eliminado no impide borrar la venta', async () => {
    const funda = await crearProducto('Funda', 5);
    const vidrio = await crearProducto('Vidrio', 5);
    const id = await salesService.add(ventaRegular([linea(funda, 1), linea(vidrio, 1)]));
    const { deleteDoc, doc } = await import('firebase/firestore');
    const { db } = await import('../../src/config/firebase');
    await deleteDoc(doc(db, COLLECTIONS.PRODUCTS, vidrio.id));

    await salesService.delete(id);

    expect(await stockDe(funda.id)).toBe(5);
  });
});
