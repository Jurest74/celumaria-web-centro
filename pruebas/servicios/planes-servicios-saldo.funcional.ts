// Plan separe, servicio técnico y saldo a favor.
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import {
  customersService,
  layawaysService,
  registrarPago,
  salesService,
  technicalServicesService,
} from '../../src/services/firebase/firestore';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import { StockInsuficienteError } from '../../src/utils/stock';
import type { LayawayItem, LayawayPlan, TechnicalService } from '../../src/types';
import {
  cortesia, crearCliente, crearProducto, documentos, limpiarEmulador, saldoDe, stockDe, ventaRegular, type ProductoPrueba
} from './ayudas';

beforeEach(limpiarEmulador);

function itemPlan(p: ProductoPrueba, cantidad: number, recogidas = 0): LayawayItem {
  return {
    id: crypto.randomUUID(),
    productId: p.id,
    productName: p.nombre,
    productPurchasePrice: p.compra,
    productSalePrice: p.venta,
    quantity: cantidad,
    totalCost: p.compra * cantidad,
    totalRevenue: p.venta * cantidad,
    profit: (p.venta - p.compra) * cantidad,
    pickedUpQuantity: recogidas,
    pickedUpHistory: [],
  } as LayawayItem;
}

function plan(customerId: string, items: LayawayItem[]) {
  const total = items.reduce((s, i) => s + i.totalRevenue, 0);
  const costo = items.reduce((s, i) => s + i.totalCost, 0);
  return {
    items,
    totalAmount: total,
    totalCost: costo,
    expectedProfit: total - costo,
    customerId,
    customerName: 'Cliente de prueba',
    downPayment: 0,
    status: 'active' as const,
  } as Omit<LayawayPlan, 'id' | 'createdAt' | 'updatedAt' | 'payments' | 'remainingBalance'>;
}

async function leerPlan(id: string): Promise<LayawayPlan> {
  return (await getDoc(doc(db, COLLECTIONS.LAYAWAYS, id))).data() as LayawayPlan;
}

describe('Plan separe', () => {
  it('al crearse reserva el stock; si no alcanza, no crea el plan', async () => {
    const clienteId = await crearCliente('Ana');
    const celular = await crearProducto('Celular', 2, 500000, 800000);

    await layawaysService.add(plan(clienteId, [itemPlan(celular, 2)]));
    expect(await stockDe(celular.id)).toBe(0);

    await expect(layawaysService.add(plan(clienteId, [itemPlan(celular, 1)]))).rejects.toBeInstanceOf(StockInsuficienteError);
    expect(await documentos(COLLECTIONS.LAYAWAYS)).toHaveLength(1);
  });

  it('se puede crear para un cliente sin correo ni teléfono', async () => {
    // Error encontrado por las pruebas de navegador: el plan llegaba con
    // customerEmail: undefined y Firestore rechazaba la transacción.
    const clienteId = await crearCliente('Sin Correo');
    const funda = await crearProducto('Funda', 2);

    const id = await layawaysService.add({ ...plan(clienteId, [itemPlan(funda, 1)]), customerEmail: undefined, customerPhone: undefined });

    expect((await leerPlan(id)).customerName).toBe('Cliente de prueba');
    expect(await stockDe(funda.id)).toBe(1);
  });

  it('agregar productos reserva el stock y guarda los totales en el mismo paso', async () => {
    const clienteId = await crearCliente('Ana');
    const celular = await crearProducto('Celular', 5, 500000, 800000);
    const funda = await crearProducto('Funda', 1, 10000, 30000);
    const id = await layawaysService.add(plan(clienteId, [itemPlan(celular, 1)]));

    await layawaysService.addProductsToLayaway(id, [itemPlan(funda, 1)], 30000, 10000);

    const guardado = await leerPlan(id);
    expect(await stockDe(funda.id)).toBe(0);
    expect(guardado.items).toHaveLength(2);
    expect(guardado.totalAmount).toBe(830000);
    expect(guardado.totalCost).toBe(510000);
    expect(guardado.expectedProfit).toBe(320000);
    expect(guardado.remainingBalance).toBe(830000);

    // Sin stock: ni se agrega el producto ni se descuenta nada.
    await expect(layawaysService.addProductsToLayaway(id, [itemPlan(funda, 1)], 30000, 10000)).rejects.toBeInstanceOf(StockInsuficienteError);
    expect((await leerPlan(id)).items).toHaveLength(2);
    expect(await stockDe(funda.id)).toBe(0);
  });

  it('dos abonos al mismo tiempo desde dos equipos quedan los dos', async () => {
    const clienteId = await crearCliente('Ana');
    const celular = await crearProducto('Celular', 1, 500000, 800000);
    const id = await layawaysService.add(plan(clienteId, [itemPlan(celular, 1)]));

    // Misma forma en que la pantalla registra un abono.
    const abonar = (monto: number) => registrarPago<LayawayPlan & { id: string }, null>(COLLECTIONS.LAYAWAYS, id, (actual) => {
      if (monto > actual.remainingBalance + 0.01) throw new Error('El saldo pendiente del plan cambió');
      return {
        cambios: {
          payments: [...(actual.payments || []), { id: crypto.randomUUID(), amount: monto, paymentDate: new Date().toISOString(), paymentMethod: 'efectivo' }],
          remainingBalance: actual.remainingBalance - monto,
        },
        ventas: [ventaRegular([], { type: 'layaway_payment', total: monto, layawayId: id, isLayaway: true })],
        resultado: null,
      };
    });

    await Promise.all([abonar(100000), abonar(150000)]);

    const guardado = await leerPlan(id);
    expect(guardado.payments).toHaveLength(2);
    expect(guardado.remainingBalance).toBe(550000);
    expect((await documentos(COLLECTIONS.SALES)).filter(v => v.type === 'layaway_payment')).toHaveLength(2);
  });

  it('cancelar devuelve lo no recogido y acredita lo pagado que no corresponde a lo recogido', async () => {
    const clienteId = await crearCliente('Ana', 0);
    const funda = await crearProducto('Funda', 5, 10000, 30000);
    const id = await layawaysService.add(plan(clienteId, [itemPlan(funda, 3)]));
    // Pagó 50.000 y recogió 1 unidad (30.000).
    const { updateDoc } = await import('firebase/firestore');
    const guardado = await leerPlan(id);
    await updateDoc(doc(db, COLLECTIONS.LAYAWAYS, id), {
      payments: [{ id: 'p1', amount: 50000, paymentDate: new Date().toISOString(), paymentMethod: 'efectivo' }],
      items: [{ ...guardado.items[0], pickedUpQuantity: 1 }],
    });

    const resultado = await layawaysService.cancel(id);

    expect(resultado.unidadesDevueltas).toBe(2);
    expect(resultado.saldoAcreditado).toBe(20000);
    expect(await stockDe(funda.id)).toBe(4); // 5 − 3 reservadas + 2 devueltas
    expect(await saldoDe(clienteId)).toBe(20000);
    expect((await leerPlan(id)).status).toBe('cancelled');
  });

  it('cancelar dos veces no devuelve stock ni saldo dos veces', async () => {
    const clienteId = await crearCliente('Ana');
    const funda = await crearProducto('Funda', 5);
    const id = await layawaysService.add(plan(clienteId, [itemPlan(funda, 2)]));

    await Promise.allSettled([layawaysService.cancel(id), layawaysService.cancel(id)]);

    expect(await stockDe(funda.id)).toBe(5);
  });

  it('un producto eliminado del inventario no impide cancelar el plan', async () => {
    const clienteId = await crearCliente('Ana');
    const funda = await crearProducto('Funda', 5);
    const vidrio = await crearProducto('Vidrio', 5);
    const id = await layawaysService.add(plan(clienteId, [itemPlan(funda, 1), itemPlan(vidrio, 1)]));
    await deleteDoc(doc(db, COLLECTIONS.PRODUCTS, vidrio.id));

    await layawaysService.cancel(id);

    expect(await stockDe(funda.id)).toBe(5);
    expect((await leerPlan(id)).status).toBe('cancelled');
  });
});

describe('Servicio técnico', () => {
  function servicio(clienteId: string, extras: Partial<TechnicalService> = {}) {
    return {
      items: [],
      totalAmount: 100000,
      totalCost: 0,
      expectedProfit: 50000,
      customerId: clienteId,
      customerName: 'Cliente de prueba',
      downPayment: 0,
      remainingBalance: 100000,
      payments: [],
      status: 'active' as const,
      serviceCost: 100000,
      laborCost: 100000,
      technicianShare: 50000,
      businessShare: 50000,
      ...extras,
    } as Omit<TechnicalService, 'id' | 'createdAt' | 'updatedAt'>;
  }

  it('las cortesías del servicio descuentan stock; los repuestos de texto libre no', async () => {
    const clienteId = await crearCliente('Ana');
    const vidrio = await crearProducto('Vidrio', 3);

    await technicalServicesService.add(servicio(clienteId, {
      items: [{ id: 'r1', partName: 'Pantalla', quantity: 1, partCost: 40000, totalCost: 40000, status: 'solicitado' }],
      courtesyItems: [cortesia(vidrio, 1)],
    }));

    expect(await stockDe(vidrio.id)).toBe(2);
  });

  it('borrar un pago desde Gestión de Ventas lo quita del servicio y borra la venta en el mismo paso', async () => {
    const clienteId = await crearCliente('Ana');
    const id = await technicalServicesService.add(servicio(clienteId, {
      payments: [{ id: 'p1', amount: 40000, paymentDate: new Date().toISOString(), paymentMethod: 'efectivo' }],
    }));
    const saleId = await salesService.add(ventaRegular([], { type: 'technical_service_payment', total: 40000, technicalServiceId: id }));

    await technicalServicesService.quitarPagoDeVenta(id, 40000, saleId);

    const guardado = (await getDoc(doc(db, COLLECTIONS.TECHNICAL_SERVICES, id))).data() as TechnicalService;
    expect(guardado.payments).toHaveLength(0);
    expect(guardado.remainingBalance).toBe(100000);
    expect(await documentos(COLLECTIONS.SALES)).toHaveLength(0);
  });

  it('si hay dos pagos del mismo monto, no adivina: no toca ni el servicio ni la venta', async () => {
    const clienteId = await crearCliente('Ana');
    const pagos = [
      { id: 'p1', amount: 20000, paymentDate: new Date().toISOString(), paymentMethod: 'efectivo' as const },
      { id: 'p2', amount: 20000, paymentDate: new Date().toISOString(), paymentMethod: 'efectivo' as const },
    ];
    const id = await technicalServicesService.add(servicio(clienteId, { payments: pagos }));
    const saleId = await salesService.add(ventaRegular([], { type: 'technical_service_payment', total: 20000, technicalServiceId: id }));

    await expect(technicalServicesService.quitarPagoDeVenta(id, 20000, saleId)).rejects.toThrow(/mismo monto/);

    const guardado = (await getDoc(doc(db, COLLECTIONS.TECHNICAL_SERVICES, id))).data() as TechnicalService;
    expect(guardado.payments).toHaveLength(2);
    expect(await documentos(COLLECTIONS.SALES)).toHaveLength(1);
  });
});

describe('Saldo a favor', () => {
  it('no se puede gastar dos veces el mismo saldo desde dos cajas', async () => {
    const clienteId = await crearCliente('Ana', 50000);

    const resultados = await Promise.allSettled([
      customersService.useCredit(clienteId, 50000),
      customersService.useCredit(clienteId, 50000),
    ]);

    expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await saldoDe(clienteId)).toBe(0);
  });

  it('usar más saldo del que hay se rechaza sin cambiar nada', async () => {
    const clienteId = await crearCliente('Ana', 30000);

    await expect(customersService.useCredit(clienteId, 40000)).rejects.toThrow(/insuficiente/);
    expect(await saldoDe(clienteId)).toBe(30000);
  });

  it('acreditar suma sobre el saldo real, no sobre una copia', async () => {
    const clienteId = await crearCliente('Ana', 10000);

    await Promise.all([customersService.addCredit(clienteId, 5000), customersService.addCredit(clienteId, 7000)]);

    expect(await saldoDe(clienteId)).toBe(22000);
  });
});
