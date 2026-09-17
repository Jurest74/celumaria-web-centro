// Cuadre de cifras: un día de operación conocido y lo que muestra cada
// pantalla de reportes. Los valores esperados salen de la contabilidad del día,
// no de lo que calcule la aplicación.
//
// Hoy (todo por la misma cajera):
//   1. Funda en efectivo           ingreso 100.000  costo 60.000   ganancia 40.000
//   2. Cargador con tarjeta        precio 50.000 + recargo 1.500 = 51.500
//                                  costo 20.000, comisión 2.000   ganancia 29.500
//   3. Vidrio en efectivo + llavero de cortesía (costo 4.000)
//                                  ingreso 30.000   costo 14.000   ganancia real 16.000
//   4. Abono de plan separe en efectivo            ingreso 200.000  ganancia 0
//   5. Pago de servicio técnico por transferencia  ingreso 80.000   ganancia 40.000
// Ayer: otra Funda en efectivo por 100.000 (no debe aparecer en "Hoy").
//
// Totales de hoy: ingresos 461.500 · ganancia real 125.500 · 5 transacciones
// Por método: efectivo 330.000 · tarjeta 51.500 · transferencia 80.000
import { expect, test, type Page } from '@playwright/test';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { salesService } from '../../src/services/firebase/firestore';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import { calculateSaleTotal } from '../../src/utils/salesCalculations';
import { subtractDaysBogota } from '../../src/utils/dateUtils';
import {
  ADMIN, CAJERA, cortesia, crearProducto, crearUsuario, iniciarSesion, irA, limpiarTodo, linea, ventaRegular,
} from './apoyo';

const pesos = (n: number) => `$ ${n.toLocaleString('es-CO')}`;

/** Valor que la pantalla muestra junto a una etiqueta. */
function valor(page: Page, etiqueta: string) {
  return page.getByText(etiqueta, { exact: true }).first().locator('xpath=following::p[1]');
}

async function sembrarDia(cajeraId: string) {
  const vendedor = { salesPersonId: cajeraId, salesPersonName: 'Caja Pruebas' };
  const funda = await crearProducto('Funda', 10, 60000, 100000);
  const cargador = await crearProducto('Cargador', 10, 20000, 50000);
  const vidrio = await crearProducto('Vidrio', 10, 10000, 30000);
  const llavero = await crearProducto('Llavero', 10, 4000, 8000);

  await salesService.add(ventaRegular([linea(funda, 1)], vendedor));

  const itemsTarjeta = [linea(cargador, 1)];
  const t = calculateSaleTotal(itemsTarjeta, 0, 'tarjeta', [], false);
  await salesService.add(ventaRegular(itemsTarjeta, {
    ...vendedor, paymentMethod: 'tarjeta', total: t.total, finalTotal: t.finalTotal,
    customerSurcharge: t.customerSurcharge, totalCommissions: t.totalCommissions, totalProfit: t.totalProfit,
  }));

  await salesService.add(ventaRegular([linea(vidrio, 1)], {
    ...vendedor, courtesyItems: [cortesia(llavero, 1)], courtesyTotalValue: 8000, courtesyTotalCost: 4000,
    realTotalCost: 14000, realProfit: 16000,
  }));

  await salesService.add(ventaRegular([], {
    ...vendedor, type: 'layaway_payment', isLayaway: true, layawayId: 'plan-prueba',
    subtotal: 200000, total: 200000, totalCost: 0, totalProfit: 0, profitMargin: 0,
  }));

  await salesService.add(ventaRegular([], {
    ...vendedor, type: 'technical_service_payment', technicalServiceId: 'servicio-prueba', paymentMethod: 'transferencia',
    subtotal: 80000, total: 80000, totalCost: 40000, totalProfit: 40000, profitMargin: 50,
  }));

  // Venta de ayer, a media tarde en Colombia.
  const ayer = new Date(`${subtractDaysBogota(1)}T15:00:00.000-05:00`).toISOString();
  await setDoc(doc(db, COLLECTIONS.SALES, 'venta-de-ayer'), {
    ...ventaRegular([linea(funda, 1)], vendedor), createdAt: ayer,
  });
}

test.beforeEach(async () => {
  await limpiarTodo();
});

test('Gestión de Ventas "Hoy": totales del día sin incluir ventas de otros días', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const cajeraId = await crearUsuario(CAJERA, 'employee');
  await sembrarDia(cajeraId);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Gestión de Ventas');

  await expect(valor(page, 'Transacciones')).toHaveText('5');
  await expect(valor(page, 'Ventas Totales')).toHaveText(pesos(461500));
  await expect(valor(page, 'Ganancia Total')).toHaveText(pesos(125500));
});

test('Gestión de Ventas "Hoy" con búsqueda: la búsqueda no trae ventas de otros días', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const cajeraId = await crearUsuario(CAJERA, 'employee');
  await sembrarDia(cajeraId);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Gestión de Ventas');
  await page.getByPlaceholder('Buscar por producto, cliente o ID de venta...').fill('Funda');

  // Hoy solo hay una Funda (la de ayer no cuenta).
  await expect(valor(page, 'Transacciones')).toHaveText('1');
  await expect(valor(page, 'Ventas Totales')).toHaveText(pesos(100000));
});

test('Panel de Control "Hoy": mismas cifras que Gestión de Ventas, con la cortesía descontada', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const cajeraId = await crearUsuario(CAJERA, 'employee');
  await sembrarDia(cajeraId);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Panel de Control');
  await page.locator('select').first().selectOption('today');

  await expect(valor(page, 'Ventas del Día')).toHaveText(pesos(461500));
  await expect(valor(page, 'Ganancia del Día')).toHaveText(pesos(125500));
});

test('Reportes del mes: incluye ayer y hoy, y cada día aparece con su fecha correcta', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const cajeraId = await crearUsuario(CAJERA, 'employee');
  await sembrarDia(cajeraId);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Reportes');

  await expect(valor(page, 'Ingresos Totales')).toHaveText(pesos(561500));
  await expect(valor(page, 'Ganancia Total')).toHaveText(pesos(165500));

  // Resumen por día: el día con 5 transacciones es hoy.
  const hoy = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' });
  // La fecha y el conteo están en dos elementos de la misma fila.
  const filaHoy = page.getByText(/5 transacciones/).locator('xpath=../..');
  await expect.soft(filaHoy, 'la fila de hoy debe llevar la fecha de hoy').toContainText(hoy);
  // La misma ganancia real que el encabezado (cortesía descontada).
  await expect.soft(filaHoy, 'la ganancia del día debe descontar la cortesía').toContainText(`+${pesos(125500)} ganancia`);
});

test('Mis Ventas del Día: el cuadre de caja suma lo mismo por tipo, por método y en total', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const cajeraId = await crearUsuario(CAJERA, 'employee');
  await sembrarDia(cajeraId);

  await iniciarSesion(page, CAJERA);
  await irA(page, 'Mis Ventas del Día');

  await expect(valor(page, 'Ventas Realizadas')).toHaveText('5');
  await expect(valor(page, 'Total Vendido')).toHaveText(pesos(461500));

  // Por método de pago (lo que debe haber en caja y en el banco).
  const metodos = page.getByRole('heading', { name: 'Ventas por Método de Pago' }).locator('xpath=ancestor::div[1]/..');
  await expect(metodos.getByText('Efectivo', { exact: true }).locator('xpath=following::p[1]')).toHaveText(pesos(330000));
  await expect(metodos.getByText('Tarjeta', { exact: true }).locator('xpath=following::p[1]')).toHaveText(pesos(51500));
  await expect(metodos.getByText('Transferencia', { exact: true }).locator('xpath=following::p[1]')).toHaveText(pesos(80000));

  // Regla del negocio: el recargo con tarjeta va en su propia línea del desglose.
  await expect(page.getByText(/Recargos por tarjeta/).first().locator('xpath=following::p[1]')).toHaveText(pesos(1500));

  // Desglose por tipo: debe sumar el total vendido.
  const desglose = page.getByRole('heading', { name: 'Desglose de Ingresos (Cuadre de Caja)' }).locator('xpath=ancestor::div[1]/..');
  const montos = await desglose.locator('p').allInnerTexts();
  const suma = montos.filter(t => t.startsWith('$')).map(t => Number(t.replace(/[^\d-]/g, ''))).reduce((s, n) => s + n, 0);
  expect(suma).toBe(461500);
});
