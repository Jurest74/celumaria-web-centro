// Edición de productos mientras en caja se sigue vendiendo: el inventario no
// puede perder ni ganar unidades por editar un producto.
import { expect, test, type Page } from '@playwright/test';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { layawaysService, salesService } from '../../src/services/firebase/firestore';
import type { LayawayItem } from '../../src/types';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import {
  ADMIN, crearCategoria, crearCliente, crearProducto, crearUsuario, documentos, iniciarSesion, irA, limpiarTodo, linea, stockDe, ventaRegular,
} from './apoyo';

test.beforeEach(async () => {
  await limpiarTodo();
});

async function abrirEdicion(page: Page, producto: string) {
  await irA(page, 'Productos');
  await page.getByRole('row', { name: new RegExp(producto) }).getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByRole('button', { name: 'Actualizar Producto' })).toBeVisible();
}

const campo = (page: Page, etiqueta: string) => page.getByText(etiqueta, { exact: true }).locator('xpath=following::input[1]');

test('cambiar el precio mientras en caja se venden 2 unidades no borra esas ventas del inventario', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const audifonos = await crearProducto('Audífonos Pro', 10, 20000, 50000, { id: await crearCategoria('Accesorios'), nombre: 'Accesorios' });

  await iniciarSesion(page, ADMIN);
  await abrirEdicion(page, 'Audífonos Pro');
  await expect(campo(page, 'Cantidad en Stock')).toHaveValue('10');

  // Otra caja vende 2 mientras el formulario está abierto.
  await salesService.add(ventaRegular([linea(audifonos, 2)]));
  expect(await stockDe(audifonos.id)).toBe(8);

  await campo(page, 'Precio de Venta (COP)').fill('55000');
  await page.getByRole('button', { name: 'Actualizar Producto' }).click();

  await expect.poll(async () => (await getDoc(doc(db, COLLECTIONS.PRODUCTS, audifonos.id))).data()?.salePrice).toBe(55000);
  expect(await stockDe(audifonos.id)).toBe(8);
  expect(await documentos(COLLECTIONS.STOCK_ADJUSTMENTS)).toHaveLength(0);
});

test('un conteo manual sobre un stock que cambió mientras se editaba se rechaza con aviso', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const audifonos = await crearProducto('Audífonos Pro', 10, 20000, 50000, { id: await crearCategoria('Accesorios'), nombre: 'Accesorios' });

  await iniciarSesion(page, ADMIN);
  await abrirEdicion(page, 'Audífonos Pro');
  await salesService.add(ventaRegular([linea(audifonos, 2)]));

  await campo(page, 'Cantidad en Stock').fill('15');
  await page.getByRole('button', { name: 'Actualizar Producto' }).click();

  await expect(page.getByText(/cambió mientras lo editabas/)).toBeVisible();
  expect(await stockDe(audifonos.id)).toBe(8);
  expect(await documentos(COLLECTIONS.STOCK_ADJUSTMENTS)).toHaveLength(0);
});

test('un conteo manual sobre el stock vigente se guarda y queda en la auditoría', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const audifonos = await crearProducto('Audífonos Pro', 10, 20000, 50000, { id: await crearCategoria('Accesorios'), nombre: 'Accesorios' });

  await iniciarSesion(page, ADMIN);
  await abrirEdicion(page, 'Audífonos Pro');
  await campo(page, 'Cantidad en Stock').fill('12');
  await page.getByRole('button', { name: 'Actualizar Producto' }).click();

  await expect.poll(() => stockDe(audifonos.id)).toBe(12);
  await expect.poll(async () => (await documentos(COLLECTIONS.STOCK_ADJUSTMENTS)).length).toBe(1);
  const [ajuste] = await documentos<{ previousStock: number; newStock: number; delta: number }>(COLLECTIONS.STOCK_ADJUSTMENTS);
  expect(ajuste).toMatchObject({ previousStock: 10, newStock: 12, delta: 2 });
});

test('no deja eliminar un producto con unidades separadas sin recoger y dice en qué planes están', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const celular = await crearProducto('Celular X1', 5, 500000, 800000, { id: await crearCategoria('Celulares'), nombre: 'Celulares' });
  const separar = async (cliente: string, cantidad: number) => {
    const item = {
      id: crypto.randomUUID(), productId: celular.id, productName: celular.nombre,
      productPurchasePrice: celular.compra, productSalePrice: celular.venta, quantity: cantidad,
      totalCost: celular.compra * cantidad, totalRevenue: celular.venta * cantidad,
      profit: (celular.venta - celular.compra) * cantidad, pickedUpQuantity: 0, pickedUpHistory: [],
    } as LayawayItem;
    await layawaysService.add({
      items: [item], totalAmount: item.totalRevenue, totalCost: item.totalCost, expectedProfit: item.profit,
      customerId: await crearCliente(cliente), customerName: cliente, downPayment: 0, status: 'active',
    });
  };
  await separar('Lina Ortiz', 2);
  await separar('Pedro Gómez', 1);
  expect(await stockDe(celular.id)).toBe(2);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Productos');
  await page.getByRole('row', { name: /Celular X1/ }).getByRole('button', { name: 'Eliminar' }).click();

  await expect(page.getByText(/No se puede eliminar "Celular X1": tiene 3 unidad\(es\) separada\(s\) sin recoger en estos 2 planes separe/)).toBeVisible();
  await expect(page.getByText(/Lina Ortiz — creado el .+ — 2 unidad\(es\)/)).toBeVisible();
  await expect(page.getByText(/Pedro Gómez — creado el .+ — 1 unidad\(es\)/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('aviso-producto-separado.png') });
  // No llega a pedir confirmación y el producto sigue ahí.
  await expect(page.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
  expect((await getDoc(doc(db, COLLECTIONS.PRODUCTS, celular.id))).exists()).toBe(true);
  expect(await stockDe(celular.id)).toBe(2);
});
