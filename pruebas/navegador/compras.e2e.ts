// Compras desde la pantalla y devoluciones a proveedor.
import { expect, test, type Page } from '@playwright/test';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { purchasesService, salesService } from '../../src/services/firebase/firestore';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import type { Purchase } from '../../src/types';
import {
  ADMIN, crearCategoria, crearProducto, crearUsuario, documentos, iniciarSesion, irA, limpiarTodo, linea,
  stockDe, ventaRegular, type ProductoPrueba,
} from './apoyo';

test.beforeEach(async () => {
  await limpiarTodo();
});

async function productoConCategoria(nombre: string, stock: number, compra: number, venta: number): Promise<ProductoPrueba> {
  return crearProducto(nombre, stock, compra, venta, { id: await crearCategoria('Repuestos'), nombre: 'Repuestos' });
}

async function sembrarCompra(p: ProductoPrueba, cantidad: number, costo: number, stockPrevio: number): Promise<string> {
  return purchasesService.add({
    items: [{
      productId: p.id, productName: p.nombre, quantity: cantidad, purchasePrice: costo, totalCost: costo * cantidad,
      previousStock: stockPrevio, previousPurchasePrice: p.compra, newSalePrice: p.venta, previousSalePrice: p.venta,
    }],
    totalCost: costo * cantidad,
    totalItems: cantidad,
  } as Omit<Purchase, 'id' | 'createdAt'>);
}

async function devolverAlProveedor(page: Page, producto: string, unidades: number) {
  await irA(page, 'Gestión de Compras');
  await page.locator('[title="Registrar devolución"]').first().click();
  await expect(page.getByRole('heading', { name: 'Procesar Devolución' })).toBeVisible();
  const fila = page.getByText(producto, { exact: true }).last().locator('xpath=ancestor::div[count(.//button) >= 2][1]');
  for (let i = 0; i < unidades; i++) {
    await fila.getByRole('button').nth(1).click();
  }
  await page.getByRole('button', { name: 'Procesar Devolución' }).last().click();
}

test('compra desde la pantalla: suma stock, promedia el costo y actualiza el precio de venta', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const bateria = await productoConCategoria('Batería X', 5, 30000, 60000);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Compras');
  await page.getByPlaceholder('Buscar por nombre o referencia...').fill('Batería');
  await page.getByRole('button', { name: /Batería X Stock: 5/ }).click();
  await page.getByText('Cantidad', { exact: true }).locator('xpath=following::input[1]').fill('5');
  await page.getByText('Precio de Compra (c/u)', { exact: true }).locator('xpath=following::input[1]').fill('40000');
  await page.getByText('Nuevo Precio de Venta', { exact: true }).locator('xpath=following::input[1]').fill('70000');
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar Compra' }).click();

  await expect.poll(() => stockDe(bateria.id)).toBe(10);
  const producto = (await getDoc(doc(db, COLLECTIONS.PRODUCTS, bateria.id))).data()!;
  expect(producto.purchasePrice).toBe(35000); // (5 × 30.000 + 5 × 40.000) / 10
  expect(producto.salePrice).toBe(70000);
  const [compra] = await documentos<Purchase>(COLLECTIONS.PURCHASES);
  expect(compra.totalCost).toBe(200000);
  expect(compra.totalItems).toBe(5);
});

test('devolución a proveedor: descuenta las unidades devueltas', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const bateria = await productoConCategoria('Batería X', 0, 30000, 60000);
  await sembrarCompra(bateria, 5, 30000, 0);
  expect(await stockDe(bateria.id)).toBe(5);

  await iniciarSesion(page, ADMIN);
  await devolverAlProveedor(page, 'Batería X', 2);

  await expect.poll(() => stockDe(bateria.id)).toBe(3);
  const [compra] = await documentos<Purchase>(COLLECTIONS.PURCHASES);
  expect(compra.totalReturned).toBe(60000);
});

test('devolución a proveedor de unidades que ya se vendieron: no puede dejar el stock en negativo', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const bateria = await productoConCategoria('Batería X', 0, 30000, 60000);
  await sembrarCompra(bateria, 5, 30000, 0);
  // Se venden 4 de las 5 compradas: queda 1 en la tienda.
  await salesService.add(ventaRegular([linea(bateria, 4)]));
  expect(await stockDe(bateria.id)).toBe(1);

  await iniciarSesion(page, ADMIN);
  await devolverAlProveedor(page, 'Batería X', 5);

  // Regla del negocio: se bloquea y se avisa cuántas unidades hay para devolver.
  await expect(page.getByText(/solo hay 1/i).first()).toBeVisible();
  expect(await stockDe(bateria.id)).toBe(1);
  const [compra] = await documentos<Purchase>(COLLECTIONS.PURCHASES);
  expect(compra.returns ?? []).toHaveLength(0);
});
