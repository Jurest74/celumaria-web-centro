// Cortesías en caja y devoluciones de productos vendidos.
import { expect, test, type Page } from '@playwright/test';
import { salesService } from '../../src/services/firebase/firestore';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import type { Sale } from '../../src/types';
import {
  ADMIN, CAJERA, crearCliente, crearProducto, crearUsuario, documentos, iniciarSesion, irA, limpiarTodo, linea,
  saldoDe, stockDe, ventaRegular,
} from './apoyo';

test.beforeEach(async () => {
  await limpiarTodo();
});

async function ventasRegulares(): Promise<(Sale & { id: string })[]> {
  return (await documentos<Sale>(COLLECTIONS.SALES)).filter(v => !v.type || v.type === 'regular');
}

async function abrirVentaEnGestion(page: Page) {
  await irA(page, 'Gestión de Ventas');
  await page.locator('tr:visible').filter({ has: page.locator('[title="Ver detalles"]') }).first()
    .locator('[title="Ver detalles"]').click();
}

test('cortesía desde la caja: descuenta su stock y la ganancia real resta su costo', async ({ page }) => {
  await crearUsuario(CAJERA, 'employee');
  const funda = await crearProducto('Funda Gris', 5, 10000, 30000);
  const vidrio = await crearProducto('Vidrio Regalo', 3, 4000, 15000);
  await crearCliente('Óscar Lima');

  await iniciarSesion(page, CAJERA);
  await irA(page, 'Ventas');
  await page.getByPlaceholder('Buscar cliente por nombre, teléfono o email...').fill('Óscar Lima');
  await page.getByText('Tel:').first().click();
  await page.getByPlaceholder('Buscar producto o escanear código de barras (automático)...').fill('Funda Gris');
  await page.getByText(/Stock: \d+/).first().click();

  await page.getByRole('button', { name: 'Añadir Cortesía' }).first().click();
  await page.getByPlaceholder('Buscar producto por nombre, referencia, IMEI...').fill('Vidrio');
  await page.getByRole('button', { name: /Vidrio Regalo/ }).first().click();
  await page.getByRole('button', { name: 'Añadir Cortesía' }).last().click();

  await page.getByRole('button', { name: 'Completar Venta' }).click();

  await expect.poll(async () => (await ventasRegulares()).length).toBe(1);
  const [venta] = await ventasRegulares();
  expect(await stockDe(funda.id)).toBe(4);
  expect(await stockDe(vidrio.id)).toBe(2);
  expect(venta.courtesyItems).toHaveLength(1);
  expect(venta.courtesyTotalCost).toBe(4000);
  expect(venta.totalProfit).toBe(20000);
  expect(venta.realProfit).toBe(16000);
  const cortesias = await documentos<{ saleId: string }>(COLLECTIONS.COURTESIES);
  expect(cortesias).toHaveLength(1);
  expect(cortesias[0].saleId).toBe(venta.id);
});

test('devolver un producto desde Gestión de Ventas regresa el stock y recalcula la venta', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const cargador = await crearProducto('Cargador Rápido', 10, 20000, 50000);
  const saleId = await salesService.add(ventaRegular([linea(cargador, 2)]));
  expect(await stockDe(cargador.id)).toBe(8);

  await iniciarSesion(page, ADMIN);
  await abrirVentaEnGestion(page);
  await page.getByRole('button', { name: 'Devolver' }).first().click();
  await page.getByRole('button', { name: 'Confirmar Devolución' }).click();

  await expect.poll(() => stockDe(cargador.id)).toBe(9);
  const venta = (await ventasRegulares()).find(v => v.id === saleId)!;
  expect(venta.items[0].quantity).toBe(1);
  expect(venta.total).toBe(50000);
  expect(venta.totalCost).toBe(20000);
  expect(venta.totalProfit).toBe(30000);
});

test('devolver un producto abonándolo al saldo a favor acredita al cliente', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const cargador = await crearProducto('Cargador Rápido', 10, 20000, 50000);
  const clienteId = await crearCliente('Paula Rey', 10000);
  await salesService.add(ventaRegular([linea(cargador, 2)], { customerId: clienteId, customerName: 'Paula Rey' }));

  await iniciarSesion(page, ADMIN);
  await abrirVentaEnGestion(page);
  await page.getByRole('button', { name: 'Devolver' }).first().click();
  await page.getByPlaceholder('Buscar cliente por nombre, teléfono...').fill('Paula');
  await page.getByRole('button', { name: /Paula Rey/ }).first().click();
  await page.getByRole('button', { name: 'Confirmar Devolución' }).click();

  await expect.poll(() => saldoDe(clienteId)).toBe(60000);
  expect(await stockDe(cargador.id)).toBe(9);
});
