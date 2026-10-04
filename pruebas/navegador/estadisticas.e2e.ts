// Estadísticas: cada prueba siembra datos conocidos, abre la pantalla real y
// compara contra el valor correcto calculado a mano. Todas fallaban antes de la
// corrección (auditoría del 2026-10-03): cada una es un error que existió.
import { expect, test, type Page } from '@playwright/test';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { purchasesService, salesService } from '../../src/services/firebase/firestore';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import { processProductReturn } from '../../src/store/thunks/salesThunks';
import { calculateSaleTotal } from '../../src/utils/salesCalculations';
import { subtractDaysBogota } from '../../src/utils/dateUtils';
import type { Purchase } from '../../src/types';
import {
  ADMIN, CAJERA, crearCategoria, crearCliente, crearProducto, crearStore, crearUsuario, iniciarSesion, irA,
  limpiarTodo, linea, ventaRegular, type ProductoPrueba,
} from './apoyo';

const pesos = (n: number) => `$ ${n.toLocaleString('es-CO')}`;
const numero = (t: string) => Number(t.replace(/[^\d-]/g, ''));
function valor(page: Page, etiqueta: string) {
  return page.getByText(etiqueta, { exact: true }).first().locator('xpath=following::p[1]');
}

test.beforeEach(async () => {
  await limpiarTodo();
});

test('1. Mis Ventas del Día: tras devolver un producto de una venta con pago combinado, los métodos suman el total', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const cajeraId = await crearUsuario(CAJERA, 'employee');
  const funda = await crearProducto('Funda', 10, 60000, 100000);
  // 2 fundas = 200.000, pagadas 100.000 en efectivo + 100.000 por transferencia.
  const saleId = await salesService.add(ventaRegular([linea(funda, 2)], {
    salesPersonId: cajeraId, salesPersonName: 'Caja Pruebas', paymentMethod: 'efectivo', useMultiplePayments: true,
    paymentMethods: [{ method: 'efectivo', amount: 100000 }, { method: 'transferencia', amount: 100000 }] as never,
  }));
  // Se devuelve 1 funda (como en Gestión de Ventas): la venta queda en 100.000.
  await crearStore().dispatch(processProductReturn({ saleId, productId: funda.id, returnQuantity: 1 })).unwrap();

  await iniciarSesion(page, CAJERA);
  await irA(page, 'Mis Ventas del Día');
  await expect(valor(page, 'Total Vendido')).toHaveText(pesos(100000));

  const metodos = page.getByRole('heading', { name: 'Ventas por Método de Pago' }).locator('xpath=ancestor::div[1]/..');
  const efectivo = numero(await metodos.getByText('Efectivo', { exact: true }).locator('xpath=following::p[1]').innerText());
  const transferencia = numero(await metodos.getByText('Transferencia', { exact: true }).locator('xpath=following::p[1]').innerText());
  expect(efectivo + transferencia).toBe(100000);
});

test('2. Gestión de Ventas: con filtro "Efectivo", buscar "Funda" no trae la venta con tarjeta', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const funda = await crearProducto('Funda', 10, 60000, 100000);
  await salesService.add(ventaRegular([linea(funda, 1)], { paymentMethod: 'efectivo' }));
  await salesService.add(ventaRegular([linea(funda, 1)], { paymentMethod: 'tarjeta' }));

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Gestión de Ventas');
  await page.locator('select').filter({ has: page.locator('option[value="efectivo"]') }).first().selectOption('efectivo');
  await expect(valor(page, 'Transacciones')).toHaveText('1');

  await page.getByPlaceholder('Buscar por producto, cliente o ID de venta...').fill('Funda');
  await page.waitForTimeout(2000);
  await expect(valor(page, 'Transacciones')).toHaveText('1');
});

test('3. Panel "Hoy": un abono de hoy a un plan creado antes aparece en la tarjeta Plan Separe', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const clienteId = await crearCliente('Lina Ortiz');
  const hace40 = new Date(`${subtractDaysBogota(40)}T15:00:00.000-05:00`).toISOString();
  await setDoc(doc(db, COLLECTIONS.LAYAWAYS, 'plan-viejo'), {
    items: [], totalAmount: 500000, totalCost: 300000, expectedProfit: 200000, customerId: clienteId,
    customerName: 'Lina Ortiz', downPayment: 0, status: 'active', remainingBalance: 300000,
    payments: [{ id: 'p1', amount: 200000, paymentDate: new Date().toISOString(), paymentMethod: 'efectivo' }],
    createdAt: hace40, updatedAt: new Date().toISOString(),
  });
  await salesService.add(ventaRegular([], {
    type: 'layaway_payment', isLayaway: true, layawayId: 'plan-viejo',
    subtotal: 200000, total: 200000, totalCost: 0, totalProfit: 0, profitMargin: 0,
  }));

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Panel de Control');
  await page.locator('select').first().selectOption('today');
  await expect(valor(page, 'Ventas del Día')).toHaveText(pesos(200000));
  await expect(valor(page, 'Plan Separe')).toHaveText(pesos(200000));
});

test('4. Clientes: el total de ventas del cliente incluye el recargo de tarjeta, como Gestión de Ventas', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const cargador = await crearProducto('Cargador', 10, 20000, 50000);
  const clienteId = await crearCliente('Paula Rey');
  const items = [linea(cargador, 1)];
  const t = calculateSaleTotal(items, 0, 'tarjeta', [], false);
  await salesService.add(ventaRegular(items, {
    customerId: clienteId, customerName: 'Paula Rey', paymentMethod: 'tarjeta', total: t.total, finalTotal: t.finalTotal,
    customerSurcharge: t.customerSurcharge, totalCommissions: t.totalCommissions, totalProfit: t.totalProfit,
  }));

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Gestión de Ventas');
  await expect(valor(page, 'Ventas Totales')).toHaveText(pesos(t.finalTotal));

  await irA(page, 'Clientes');
  await page.getByRole('row', { name: /Paula Rey/ }).locator('[title="Ver información del cliente"]').click();
  await page.getByRole('button', { name: 'Estadísticas de Ventas' }).click();
  const total = page.getByText('Total Ventas', { exact: true }).first().locator('xpath=following::p[1]');
  await expect(total).not.toHaveText(pesos(0));
  await expect(total).toHaveText(pesos(t.finalTotal));
});

test('5. Gestión de Compras: el "Total Compras" descuenta lo devuelto al proveedor, como cada fila', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const bateria: ProductoPrueba = await crearProducto('Batería X', 0, 30000, 60000, { id: await crearCategoria('Repuestos'), nombre: 'Repuestos' });
  await purchasesService.add({
    items: [{
      productId: bateria.id, productName: bateria.nombre, quantity: 5, purchasePrice: 30000, totalCost: 150000,
      previousStock: 0, previousPurchasePrice: 30000, newSalePrice: 60000, previousSalePrice: 60000,
    }],
    totalCost: 150000, totalItems: 5,
  } as Omit<Purchase, 'id' | 'createdAt'>);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Gestión de Compras');
  await page.locator('[title="Registrar devolución"]').first().click();
  await expect(page.getByRole('heading', { name: 'Procesar Devolución' })).toBeVisible();
  const fila = page.getByText('Batería X', { exact: true }).last().locator('xpath=ancestor::div[count(.//button) >= 2][1]');
  for (let i = 0; i < 2; i++) await fila.getByRole('button').nth(1).click();
  await page.getByRole('button', { name: 'Procesar Devolución' }).last().click();
  await expect(page.getByText('-' + pesos(60000)).first()).toBeVisible();

  await page.reload();
  await irA(page, 'Gestión de Compras');
  const total = valor(page, 'Total Compras');
  await expect(total).not.toHaveText(pesos(0));
  await expect(total).toHaveText(pesos(90000));
});

test('6. Ventas de Celulares: la ganancia descuenta la comisión del datáfono, como la ganancia general', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const celulares = await crearCategoria('Celulares');
  const celular = await crearProducto('Celular A1', 5, 300000, 500000, { id: celulares, nombre: 'Celulares' });
  const items = [linea(celular, 1)];
  const t = calculateSaleTotal(items, 0, 'tarjeta', [], false);
  await salesService.add(ventaRegular(items, {
    paymentMethod: 'tarjeta', total: t.total, finalTotal: t.finalTotal,
    customerSurcharge: t.customerSurcharge, totalCommissions: t.totalCommissions, totalProfit: t.totalProfit,
  }));

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Gestión de Ventas');
  await expect(valor(page, 'Ganancia Total')).toHaveText(pesos(t.totalProfit));
  await page.getByRole('button', { name: /Ventas de Celulares/ }).click();
  const seccion = page.getByText('📱 Estadísticas de Celulares').locator('xpath=ancestor::div[2]');
  const ganancia = seccion.getByText('Ganancia Total', { exact: true }).locator('xpath=following::p[1]');
  await expect(ganancia).not.toHaveText(pesos(0));
  await expect(ganancia).toHaveText(pesos(t.totalProfit));
});

test('7. Gestión de Ventas: cambiar el filtro mientras cargan las cifras', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const funda = await crearProducto('Funda', 10, 60000, 100000);
  await salesService.add(ventaRegular([linea(funda, 1)], { paymentMethod: 'efectivo' }));
  await salesService.add(ventaRegular([linea(funda, 1)], { paymentMethod: 'tarjeta' }));

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Gestión de Ventas');
  // Sin esperar a que terminen de cargar las cifras.
  await page.locator('select').filter({ has: page.locator('option[value="efectivo"]') }).first().selectOption('efectivo');
  // La lista ya filtraba bien; las cifras de arriba deben coincidir con ella.
  await expect(page.locator('tr:visible').filter({ has: page.locator('[title="Ver detalles"]') })).toHaveCount(1);
  await expect(valor(page, 'Transacciones')).toHaveText('1');
});

test('8. Gestión de Compras: una compra devuelta por completo queda en $ 0, en la fila y en el total', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const bateria: ProductoPrueba = await crearProducto('Batería X', 0, 30000, 60000, { id: await crearCategoria('Repuestos'), nombre: 'Repuestos' });
  await purchasesService.add({
    items: [{
      productId: bateria.id, productName: bateria.nombre, quantity: 2, purchasePrice: 30000, totalCost: 60000,
      previousStock: 0, previousPurchasePrice: 30000, newSalePrice: 60000, previousSalePrice: 60000,
    }],
    totalCost: 60000, totalItems: 2,
  } as Omit<Purchase, 'id' | 'createdAt'>);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Gestión de Compras');
  await page.locator('[title="Registrar devolución"]').first().click();
  await expect(page.getByRole('heading', { name: 'Procesar Devolución' })).toBeVisible();
  const fila = page.getByText('Batería X', { exact: true }).last().locator('xpath=ancestor::div[count(.//button) >= 2][1]');
  for (let i = 0; i < 2; i++) await fila.getByRole('button').nth(1).click();
  await page.getByRole('button', { name: 'Procesar Devolución' }).last().click();
  await expect(page.getByText('-' + pesos(60000)).first()).toBeVisible();

  await page.reload();
  await irA(page, 'Gestión de Compras');
  // La fila muestra original, devuelto y neto: el neto debe ser 0. Antes
  // mostraba el costo original (60.000) como neto.
  const filaCompra = page.getByText('-' + pesos(60000)).first().locator('xpath=ancestor::tr[1]');
  await expect(filaCompra).toContainText(/\$\s0\s*Neto/);
  await expect(valor(page, 'Total Compras')).toHaveText(pesos(0));
});
