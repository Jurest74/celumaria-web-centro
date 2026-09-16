// Flujos de caja en la pantalla de Ventas, como los hace un cajero.
import { expect, test, type Page } from '@playwright/test';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import type { Sale } from '../../src/types';
import {
  CAJERA, crearCliente, crearProducto, crearUsuario, documentos, iniciarSesion, irA, limpiarTodo, stockDe,
} from './apoyo';

test.beforeEach(async () => {
  await limpiarTodo();
});

async function prepararVenta(page: Page, producto: string, cliente: string) {
  await irA(page, 'Ventas');
  await page.getByPlaceholder('Buscar cliente por nombre, teléfono o email...').fill(cliente);
  // Sugerencia del buscador de clientes (muestra el teléfono).
  await page.getByText('Tel:').first().click();
  await page.getByPlaceholder('Buscar producto o escanear código de barras (automático)...').fill(producto);
  // Sugerencia del buscador de productos (muestra el stock).
  await page.getByText(/Stock: \d+/).first().click();
  await expect(page.getByText('Productos en la venta (1 tipos, 1 unidades)')).toBeVisible();
}

async function ventasGuardadas(): Promise<Sale[]> {
  return (await documentos<Sale>(COLLECTIONS.SALES)).filter(v => !v.type || v.type === 'regular');
}

test('venta en efectivo: descuenta stock y queda registrada con el vendedor', async ({ page }) => {
  const uid = await crearUsuario(CAJERA, 'employee');
  const funda = await crearProducto('Funda Azul', 10, 10000, 30000);
  await crearCliente('Laura Gómez');

  await iniciarSesion(page, CAJERA);
  await prepararVenta(page, 'Funda Azul', 'Laura Gómez');
  await page.getByRole('button', { name: 'Completar Venta' }).click();

  await expect.poll(async () => (await ventasGuardadas()).length).toBe(1);
  const [venta] = await ventasGuardadas();
  expect(venta.total).toBe(30000);
  expect(venta.finalTotal ?? venta.total).toBe(30000);
  expect(venta.totalProfit).toBe(20000);
  expect(venta.salesPersonId).toBe(uid);
  expect(await stockDe(funda.id)).toBe(9);
});

test('venta con tarjeta en pago único: registra el recargo del 3% y la comisión del 4%', async ({ page }) => {
  await crearUsuario(CAJERA, 'employee');
  const funda = await crearProducto('Funda Roja', 5, 10000, 100000);
  await crearCliente('Pedro Ruiz');

  await iniciarSesion(page, CAJERA);
  await prepararVenta(page, 'Funda Roja', 'Pedro Ruiz');
  await page.locator('select').last().selectOption('tarjeta');
  await page.getByRole('button', { name: 'Completar Venta' }).click();

  await expect.poll(async () => (await ventasGuardadas()).length).toBe(1);
  const [venta] = await ventasGuardadas();
  expect(venta.total).toBe(100000);
  expect(venta.customerSurcharge).toBe(3000);
  expect(venta.finalTotal).toBe(103000);
  expect(venta.totalCommissions).toBe(4000);
  expect(venta.totalProfit).toBe(103000 - 10000 - 4000);
  expect(await stockDe(funda.id)).toBe(4);
});

test('pagos múltiples efectivo + tarjeta: el recargo aplica solo a la parte con tarjeta', async ({ page }) => {
  await crearUsuario(CAJERA, 'employee');
  await crearProducto('Cargador Rápido', 5, 20000, 100000);
  await crearCliente('Marta Díaz');

  await iniciarSesion(page, CAJERA);
  await prepararVenta(page, 'Cargador Rápido', 'Marta Díaz');

  await page.getByText('Pagos múltiples').click();
  const montos = page.getByPlaceholder('Monto');
  const metodo = page.locator('select').last();

  await metodo.selectOption('efectivo');
  await montos.fill('50000');
  await page.getByRole('button', { name: 'Agregar' }).click();

  await metodo.selectOption('tarjeta');
  await expect(page.getByText(/Con tarjeta se cobra 3% de recargo/)).toBeVisible();
  await page.getByRole('button', { name: 'Todo' }).click();

  await page.getByRole('button', { name: 'Completar Venta' }).click();

  await expect.poll(async () => (await ventasGuardadas()).length).toBe(1);
  const [venta] = await ventasGuardadas();
  expect(venta.total).toBe(100000);
  expect(venta.customerSurcharge).toBe(1500);
  expect(venta.finalTotal).toBe(101500);
  const pagos = (venta.paymentMethods || []).map(p => [p.method, p.amount]);
  expect(pagos).toEqual([['efectivo', 50000], ['tarjeta', 51500]]);
});

test('no deja agregar más unidades de las que hay en stock', async ({ page }) => {
  await crearUsuario(CAJERA, 'employee');
  const vidrio = await crearProducto('Vidrio Templado', 1, 2000, 15000);
  await crearCliente('Sofía Mora');

  await iniciarSesion(page, CAJERA);
  await prepararVenta(page, 'Vidrio Templado', 'Sofía Mora');

  // Intentar subir a 2 unidades con el botón "+" de la línea.
  await page.getByText('por unidad').locator('xpath=../..').getByRole('button').nth(1).click();

  await expect(page.getByText('Stock insuficiente').first()).toBeVisible();
  await expect(page.getByText('Productos en la venta (1 tipos, 1 unidades)')).toBeVisible();

  await page.getByRole('button', { name: 'Completar Venta' }).click();
  await expect.poll(async () => (await ventasGuardadas()).length).toBe(1);
  const [venta] = await ventasGuardadas();
  expect(venta.items[0].quantity).toBe(1);
  expect(await stockDe(vidrio.id)).toBe(0);
});
