// Plan separe: recogidas manuales, agregar productos y pagar con saldo a favor.
import { expect, test } from '@playwright/test';
import { layawaysService } from '../../src/services/firebase/firestore';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import type { LayawayItem, LayawayPlan, Sale } from '../../src/types';
import {
  ADMIN, abrirDetallePlan, confirmar, crearCliente, crearProducto, crearUsuario, documentos, iniciarSesion, irA,
  limpiarTodo, registrarPagoEnDialogo, saldoDe, stockDe, type ProductoPrueba,
} from './apoyo';

test.beforeEach(async () => {
  await limpiarTodo();
});

function item(p: ProductoPrueba, cantidad: number): LayawayItem {
  return {
    id: crypto.randomUUID(), productId: p.id, productName: p.nombre,
    productPurchasePrice: p.compra, productSalePrice: p.venta, quantity: cantidad,
    totalCost: p.compra * cantidad, totalRevenue: p.venta * cantidad, profit: (p.venta - p.compra) * cantidad,
    pickedUpQuantity: 0, pickedUpHistory: [],
  } as LayawayItem;
}

async function sembrarPlan(clienteId: string, cliente: string, items: LayawayItem[]): Promise<string> {
  const total = items.reduce((s, i) => s + i.totalRevenue, 0);
  const costo = items.reduce((s, i) => s + i.totalCost, 0);
  return layawaysService.add({
    items, totalAmount: total, totalCost: costo, expectedProfit: total - costo,
    customerId: clienteId, customerName: cliente, downPayment: 0, status: 'active',
    salesPersonName: 'Admin Pruebas',
  });
}

async function plan(): Promise<LayawayPlan & { id: string }> {
  return (await documentos<LayawayPlan>(COLLECTIONS.LAYAWAYS))[0];
}

async function entregas(): Promise<Sale[]> {
  return (await documentos<Sale>(COLLECTIONS.SALES)).filter(v => v.type === 'layaway_delivery');
}

test('recoger, revertir y volver a recoger: la ganancia de la entrega queda registrada una sola vez', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const funda = await crearProducto('Funda Negra', 5, 10000, 30000);
  const clienteId = await crearCliente('Lina Ortiz');
  await sembrarPlan(clienteId, 'Lina Ortiz', [item(funda, 2)]);
  expect(await stockDe(funda.id)).toBe(3);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Plan Separe');
  await abrirDetallePlan(page, 'Lina Ortiz');

  // Recoger 1 de 2.
  await page.getByRole('button', { name: 'Recoger' }).click();
  await page.locator('input[name="quantity"]').fill('1');
  await page.getByRole('button', { name: 'Marcar como Recogido' }).click();

  await expect.poll(async () => (await plan()).items[0].pickedUpQuantity).toBe(1);
  let entregasGuardadas = await entregas();
  expect(entregasGuardadas).toHaveLength(1);
  expect(entregasGuardadas[0].totalProfit).toBe(20000);
  expect((entregasGuardadas[0] as Sale & { pickupId?: string }).pickupId).toBe((await plan()).items[0].pickedUpHistory?.[0].id);
  expect(await stockDe(funda.id)).toBe(3); // entregar no vuelve a descontar

  // Revertir la recogida: se borra su registro de entrega.
  await page.locator('[title="Revertir recogida"]').first().click();
  await confirmar(page);
  await expect.poll(async () => (await plan()).items[0].pickedUpQuantity).toBe(0);
  expect(await entregas()).toHaveLength(0);

  // Volver a recoger: una sola entrega, no dos.
  await page.getByRole('button', { name: 'Recoger' }).click();
  await page.locator('input[name="quantity"]').fill('1');
  await page.getByRole('button', { name: 'Marcar como Recogido' }).click();
  await expect.poll(async () => (await plan()).items[0].pickedUpQuantity).toBe(1);
  entregasGuardadas = await entregas();
  expect(entregasGuardadas).toHaveLength(1);
  expect(entregasGuardadas[0].totalProfit).toBe(20000);
});

test('agregar productos a un plan desde la pantalla reserva el stock y actualiza los totales', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const celular = await crearProducto('Celular Base', 3, 400000, 600000);
  const cargador = await crearProducto('Cargador Tipo C', 4, 15000, 40000);
  const clienteId = await crearCliente('Iván Castro');
  await sembrarPlan(clienteId, 'Iván Castro', [item(celular, 1)]);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Plan Separe');
  await abrirDetallePlan(page, 'Iván Castro');

  await page.getByRole('button', { name: 'Agregar Productos' }).first().click();
  await page.getByPlaceholder('Buscar producto...').last().fill('Cargador');
  await page.getByRole('button', { name: /Cargador Tipo C/ }).last().click();
  await page.locator('input[type="number"][min="1"]').last().fill('2');
  await page.locator('input[type="number"][min="1"]').last().locator('xpath=following-sibling::button[1]').click();
  await page.getByRole('button', { name: 'Agregar Productos' }).last().click();

  await expect.poll(async () => (await plan()).items.length).toBe(2);
  const guardado = await plan();
  expect(guardado.totalAmount).toBe(680000);
  expect(guardado.totalCost).toBe(430000);
  expect(guardado.expectedProfit).toBe(250000);
  expect(guardado.remainingBalance).toBe(680000);
  expect(await stockDe(cargador.id)).toBe(2);
  expect(await stockDe(celular.id)).toBe(2);
});

test('abonar usando saldo a favor descuenta el saldo del cliente y lo registra en el pago', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const celular = await crearProducto('Celular Base', 3, 200000, 300000);
  const clienteId = await crearCliente('Rosa Vélez', 100000);
  await sembrarPlan(clienteId, 'Rosa Vélez', [item(celular, 1)]);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Plan Separe');
  await abrirDetallePlan(page, 'Rosa Vélez');

  await registrarPagoEnDialogo(page, '50000', async (p) => {
    await p.locator('#useCredit').check();
  });

  await expect.poll(async () => (await plan()).payments?.length).toBe(1);
  const guardado = await plan();
  expect(guardado.payments[0].amount).toBe(150000);
  expect(guardado.remainingBalance).toBe(150000);
  expect(await saldoDe(clienteId)).toBe(0);
  const [abono] = (await documentos<Sale>(COLLECTIONS.SALES)).filter(v => v.type === 'layaway_payment');
  expect(abono.total).toBe(150000);
  expect(abono.paymentMethods?.find(m => m.method === 'credit')?.amount).toBe(100000);
});
