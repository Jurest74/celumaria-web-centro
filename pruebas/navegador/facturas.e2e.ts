// Factura de venta reimpresa desde Gestión de Ventas: fecha de la venta y
// cifras que cuadran con lo guardado. La de la fecha fallaba antes de la
// corrección (auditoría del 2026-10-04): se imprimía la hora de impresión.
import { expect, test, type Page } from '@playwright/test';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { salesService } from '../../src/services/firebase/firestore';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import { calculateSaleTotal } from '../../src/utils/salesCalculations';
import { subtractDaysBogota } from '../../src/utils/dateUtils';
import { ADMIN, cortesia, crearProducto, crearUsuario, iniciarSesion, irA, limpiarTodo, linea, ventaRegular } from './apoyo';

const numero = (t: string) => Number(t.replace(/[^\d-]/g, ''));

test.beforeEach(async () => {
  await limpiarTodo();
});

async function abrirFactura(page: Page, periodo: string) {
  await irA(page, 'Gestión de Ventas');
  await page.locator('select').filter({ has: page.locator(`option[value="${periodo}"]`) }).first().selectOption(periodo);
  await page.locator('tr:visible').filter({ has: page.locator('[title="Ver detalles"]') }).first()
    .locator('[title="Ver detalles"]').click();
  await page.getByRole('button', { name: 'Imprimir factura' }).click();
  return page.locator('.factura-recibo').last();
}

test('la factura reimpresa de una venta de hace 5 días muestra la fecha de la venta', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const funda = await crearProducto('Funda', 10, 60000, 100000);
  const diaVenta = subtractDaysBogota(5);
  await setDoc(doc(db, COLLECTIONS.SALES, 'venta-vieja'), {
    ...ventaRegular([linea(funda, 1)], { customerName: 'Paula Rey' }),
    createdAt: new Date(`${diaVenta}T15:00:00.000-05:00`).toISOString(),
  });

  await iniciarSesion(page, ADMIN);
  const factura = await abrirFactura(page, 'week');
  const fecha = (await factura.getByText(/^Fecha:/).innerText()).trim();
  const esperada = new Date(`${diaVenta}T15:00:00.000-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
  expect(fecha).toContain(esperada);
});

test('las cifras de la factura cuadran: subtotal − descuento + recargo = total guardado', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const funda = await crearProducto('Funda', 10, 60000, 100000);
  const vidrio = await crearProducto('Vidrio', 10, 10000, 30000);
  const llavero = await crearProducto('Llavero', 10, 4000, 8000);
  const items = [linea(funda, 2), linea(vidrio, 1)];
  const t = calculateSaleTotal(items, 10000, 'tarjeta', [], false);
  await salesService.add(ventaRegular(items, {
    customerName: 'Paula Rey', paymentMethod: 'tarjeta', subtotal: t.subtotal, discount: 10000,
    total: t.total, finalTotal: t.finalTotal, customerSurcharge: t.customerSurcharge,
    totalCommissions: t.totalCommissions, totalProfit: t.totalProfit,
    courtesyItems: [cortesia(llavero, 1)], courtesyTotalValue: 8000, courtesyTotalCost: 4000,
  }));

  await iniciarSesion(page, ADMIN);
  const factura = await abrirFactura(page, 'today');
  const linea_ = async (etiqueta: string) =>
    numero(await factura.getByText(etiqueta, { exact: true }).first().locator('xpath=following-sibling::span[1]').innerText());
  const subtotal = await linea_('Subtotal:');
  const descuento = Math.abs(await linea_('Descuento:'));
  const recargo = await linea_('Recargo por método de pago:');
  const total = await linea_('Total:');
  expect(total).toBe(Math.round(t.finalTotal));
  expect(subtotal - descuento + recargo).toBe(total);
});
