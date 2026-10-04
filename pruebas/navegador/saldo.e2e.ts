// Saldo a favor: lo que pasa a saldo deja de contar como venta, y en Ventas el
// saldo se avisa y se puede usar de forma opcional.
//
// La primera prueba fallaba antes de la corrección (auditoría del 2026-10-04):
// la plata de un plan cancelado se contaba dos veces como venta.
import { expect, test, type Page } from '@playwright/test';
import { layawaysService } from '../../src/services/firebase/firestore';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import { calculatePaymentCommission } from '../../src/utils/paymentCommission';
import type { LayawayItem, Sale } from '../../src/types';
import {
  ADMIN, CAJERA, abrirDetallePlan, confirmar, crearCliente, crearProducto, crearUsuario, documentos, iniciarSesion, irA,
  limpiarTodo, registrarPagoEnDialogo, saldoDe, type ProductoPrueba,
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

async function sembrarPlan(clienteId: string, cliente: string, items: LayawayItem[]) {
  const total = items.reduce((s, i) => s + i.totalRevenue, 0);
  const costo = items.reduce((s, i) => s + i.totalCost, 0);
  return layawaysService.add({
    items, totalAmount: total, totalCost: costo, expectedProfit: total - costo,
    customerId: clienteId, customerName: cliente, downPayment: 0, status: 'active', salesPersonName: 'Admin Pruebas',
  });
}

const sumaVentas = async () => (await documentos<Sale>(COLLECTIONS.SALES)).reduce((s, v) => s + (v.finalTotal ?? v.total ?? 0), 0);
const ventasRegulares = async () => (await documentos<Sale>(COLLECTIONS.SALES)).filter(v => !v.type || v.type === 'regular');

function valor(page: Page, etiqueta: string) {
  return page.getByText(etiqueta, { exact: true }).first().locator('xpath=following::p[1]');
}

async function prepararVenta(page: Page, producto: string, cliente: string) {
  await irA(page, 'Ventas');
  await page.getByPlaceholder('Buscar cliente por nombre, teléfono o email...').fill(cliente);
  await page.getByText('Tel:').first().click();
  await page.getByPlaceholder('Buscar producto o escanear código de barras (automático)...').fill(producto);
  await page.getByText(/Stock: \d+/).first().click();
  await expect(page.getByText('Productos en la venta (1 tipos, 1 unidades)')).toBeVisible();
}

test('cancelar un plan con abono y usar ese saldo en otro plan: cada peso cuenta como venta una sola vez', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const celular = await crearProducto('Celular A', 5, 300000, 500000);
  const funda = await crearProducto('Funda B', 5, 100000, 300000);
  const clienteId = await crearCliente('Rosa Vélez', 0);
  await sembrarPlan(clienteId, 'Rosa Vélez', [item(celular, 1)]);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Plan Separe');
  await abrirDetallePlan(page, 'Rosa Vélez');
  // 1. Abono en efectivo de 200.000 al plan A.
  await registrarPagoEnDialogo(page, '200000');
  await expect.poll(sumaVentas).toBe(200000);

  // 2. Cancelar el plan A: los 200.000 pasan a saldo a favor y dejan de ser venta.
  await page.getByRole('button', { name: 'Cancelar Plan Separe', exact: true }).click();
  await confirmar(page);
  await expect.poll(() => saldoDe(clienteId)).toBe(200000);
  await expect.poll(sumaVentas).toBe(0);

  // 3. Plan B de 300.000: 200.000 con el saldo + 100.000 en efectivo.
  await sembrarPlan(clienteId, 'Rosa Vélez', [item(funda, 1)]);
  await page.goto('/');
  await irA(page, 'Plan Separe');
  await page.getByRole('heading', { name: 'Rosa Vélez', level: 3 }).first()
    .locator('xpath=ancestor::div[.//button[normalize-space()="Ver detalles" or @title="Ver detalles"]][1]')
    .getByRole('button', { name: 'Ver detalles' }).first().click();
  await registrarPagoEnDialogo(page, '100000', async (p) => { await p.locator('#useCredit').check(); });
  await expect.poll(() => saldoDe(clienteId)).toBe(0);

  // Dinero que entró de verdad: 200.000 (plan A) + 100.000 (plan B).
  await expect.poll(sumaVentas).toBe(300000);
  await page.goto('/');
  await irA(page, 'Gestión de Ventas');
  await expect(valor(page, 'Ventas Totales')).toHaveText('$ 300.000');
});

test('Ventas: si el cliente tiene saldo se avisa, y si no se marca no se usa', async ({ page }) => {
  await crearUsuario(CAJERA, 'employee');
  await crearProducto('Funda Azul', 10, 10000, 100000);
  const clienteId = await crearCliente('Laura Gómez', 40000);

  await iniciarSesion(page, CAJERA);
  await prepararVenta(page, 'Funda Azul', 'Laura Gómez');
  await expect(page.getByText('Este cliente tiene $ 40.000 de saldo a favor')).toBeVisible();
  await expect(page.locator('#usarSaldoVenta')).not.toBeChecked();
  await page.getByRole('button', { name: 'Completar Venta' }).click();

  await expect.poll(async () => (await ventasRegulares()).length).toBe(1);
  const [venta] = await ventasRegulares();
  expect(venta.total).toBe(100000);
  expect(venta.paymentMethods ?? []).toHaveLength(0);
  expect(await saldoDe(clienteId)).toBe(40000);
});

test('Ventas: usar el saldo en efectivo cobra solo el resto y descuenta el saldo', async ({ page }) => {
  await crearUsuario(CAJERA, 'employee');
  await crearProducto('Funda Azul', 10, 10000, 100000);
  const clienteId = await crearCliente('Laura Gómez', 40000);

  await iniciarSesion(page, CAJERA);
  await prepararVenta(page, 'Funda Azul', 'Laura Gómez');
  await page.locator('#usarSaldoVenta').check();
  await expect(page.getByText('A pagar', { exact: true }).locator('xpath=following-sibling::span[1]')).toHaveText('$ 60.000');
  await page.getByRole('button', { name: 'Completar Venta' }).click();

  await expect.poll(async () => (await ventasRegulares()).length).toBe(1);
  const [venta] = await ventasRegulares();
  expect(venta.total).toBe(100000);
  expect(venta.finalTotal ?? venta.total).toBe(100000);
  expect(venta.paymentMethods).toEqual([
    { method: 'credit', amount: 40000 },
    { method: 'efectivo', amount: 60000, commission: 0 },
  ]);
  expect(await saldoDe(clienteId)).toBe(0);
  // La factura muestra el saldo aplicado.
  await expect(page.getByText('Saldo a favor aplicado:')).toBeVisible();
});

test('Ventas: con saldo y tarjeta, el recargo y la comisión corren solo sobre lo que se paga con tarjeta', async ({ page }) => {
  await crearUsuario(CAJERA, 'employee');
  await crearProducto('Funda Azul', 10, 10000, 100000);
  const clienteId = await crearCliente('Laura Gómez', 40000);

  await iniciarSesion(page, CAJERA);
  await prepararVenta(page, 'Funda Azul', 'Laura Gómez');
  await page.locator('#usarSaldoVenta').check();
  await page.locator('select').last().selectOption('tarjeta');
  await page.getByRole('button', { name: 'Completar Venta' }).click();

  await expect.poll(async () => (await ventasRegulares()).length).toBe(1);
  const [venta] = await ventasRegulares();
  // 60.000 con tarjeta: recargo 3 % = 1.800.
  expect(venta.customerSurcharge).toBe(1800);
  expect(venta.finalTotal).toBe(101800);
  expect(venta.totalCommissions).toBe(calculatePaymentCommission('tarjeta', 60000));
  expect(venta.paymentMethods?.[0]).toEqual({ method: 'credit', amount: 40000 });
  expect(venta.paymentMethods?.[1]).toMatchObject({ method: 'tarjeta', amount: 61800 });
  expect(await saldoDe(clienteId)).toBe(0);
});

test('Ventas: si el saldo cubre todo, no se cobra nada y queda el saldo sobrante', async ({ page }) => {
  await crearUsuario(CAJERA, 'employee');
  await crearProducto('Funda Azul', 10, 10000, 100000);
  const clienteId = await crearCliente('Laura Gómez', 150000);

  await iniciarSesion(page, CAJERA);
  await prepararVenta(page, 'Funda Azul', 'Laura Gómez');
  await page.locator('#usarSaldoVenta').check();
  await page.locator('select').last().selectOption('tarjeta');
  await page.getByRole('button', { name: 'Completar Venta' }).click();

  await expect.poll(async () => (await ventasRegulares()).length).toBe(1);
  const [venta] = await ventasRegulares();
  expect(venta.finalTotal ?? venta.total).toBe(100000);
  expect(venta.customerSurcharge ?? 0).toBe(0);
  expect(venta.paymentMethods).toEqual([{ method: 'credit', amount: 100000 }]);
  expect(await saldoDe(clienteId)).toBe(50000);
});
