// Servicio técnico: pagos, anulaciones y precio. Las pruebas 1 a 4 fallaban
// antes de la corrección (auditoría del 2026-10-04).
import { expect, test, type Page } from '@playwright/test';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import type { Sale, TechnicalService } from '../../src/types';
import { ADMIN, confirmar, crearCliente, crearUsuario, documentos, iniciarSesion, irA, limpiarTodo, saldoDe } from './apoyo';

test.beforeEach(async () => {
  await limpiarTodo();
});

async function servicioGuardado(): Promise<TechnicalService & { id: string }> {
  const [servicio] = await documentos<TechnicalService>(COLLECTIONS.TECHNICAL_SERVICES);
  return servicio;
}
const ventasDeServicio = async () => (await documentos<Sale>(COLLECTIONS.SALES)).filter(v => v.type === 'technical_service_payment');

async function prepararTaller(saldo = 0): Promise<string> {
  await crearUsuario(ADMIN, 'admin');
  const clienteId = await crearCliente('Andrés Ríos', saldo);
  await addDoc(collection(db, COLLECTIONS.TECHNICIANS), { name: 'Técnico Uno', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  return clienteId;
}

async function crearServicio(page: Page, costo: string, abono: string) {
  await irA(page, 'Servicio Técnico');
  await page.getByRole('button', { name: 'Nuevo Servicio Técnico' }).click();
  await page.getByPlaceholder('Buscar cliente por nombre, teléfono o email...').fill('Andrés Ríos');
  await page.getByRole('button', { name: /Andrés Ríos -/ }).click();
  await page.getByRole('textbox', { name: 'Marca y Referencia del Equipo' }).fill('Samsung A54');
  await page.getByRole('textbox', { name: 'Falla Reportada *' }).fill('Pantalla rota');
  await page.getByRole('textbox', { name: 'Costo Servicio Técnico *' }).fill(costo);
  await page.getByRole('combobox', { name: 'Técnico Asignado' }).selectOption({ label: 'Técnico Uno' });
  await page.getByText('Monto (COP)').locator('xpath=following::input[1]').fill(abono);
  await page.getByRole('button', { name: 'Crear Servicio Técnico' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Ver detalles' }).click();
  await expect(page.getByRole('heading', { name: 'Servicio Técnico - Andrés Ríos' })).toBeVisible();
}

async function pagar(page: Page, monto: string, conSaldo = false) {
  await page.getByRole('button', { name: 'Registrar Pago' }).first().click();
  if (conSaldo) await page.locator('#useCredit').check();
  const dialogo = page.getByRole('heading', { name: 'Registrar Pago' }).locator('xpath=ancestor::div[.//textarea or .//input][1]');
  await dialogo.getByRole('textbox', { name: '0' }).fill(monto);
  await page.getByRole('button', { name: 'Registrar Pago' }).last().click();
}

async function editarPrecio(page: Page, precio: string) {
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByText('Costo Total del Servicio Técnico').locator('xpath=following::input[1]').fill(precio);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(async () => (await servicioGuardado()).serviceCost).toBe(Number(precio));
}

test('1. anular un pago hecho con saldo a favor le devuelve el saldo al cliente', async ({ page }) => {
  const clienteId = await prepararTaller(50000);
  await iniciarSesion(page, ADMIN);
  await crearServicio(page, '150000', '0');

  // Pago de 100.000: 50.000 de saldo + 50.000 en efectivo.
  await pagar(page, '50000', true);
  await expect.poll(() => saldoDe(clienteId)).toBe(0);
  await expect.poll(async () => (await servicioGuardado()).payments.length).toBe(1);
  expect((await servicioGuardado()).payments[0].amount).toBe(100000);

  await page.locator('[title="Cancelar pago"]').first().click();
  await confirmar(page);
  await expect.poll(async () => (await servicioGuardado()).payments.length).toBe(0);
  await expect.poll(() => saldoDe(clienteId)).toBe(50000);
});

test('2. cancelar con penalización un servicio sin pagos deja registrada la penalización', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await crearServicio(page, '150000', '0');

  await page.getByRole('button', { name: 'Cancelar Servicio Técnico', exact: true }).click();
  await page.getByText('Penalización por Cancelación').first().locator('xpath=following::input[1]').fill('20000');
  await page.getByRole('button', { name: /Cancelar|Confirmar|Aplicar/ }).last().click();
  await expect.poll(async () => (await servicioGuardado()).status).toBe('cancelled');
  const s = await servicioGuardado();
  expect(s.payments.map(p => p.amount)).toEqual([20000]);
  expect((await ventasDeServicio()).map(v => v.total)).toEqual([20000]);
});

test('3. tras subir el precio, el mensaje del siguiente pago muestra el saldo pendiente real', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await crearServicio(page, '150000', '50000');
  await editarPrecio(page, '200000');

  // Faltan 150.000; se pagan 50.000: quedan 100.000.
  await pagar(page, '50000');
  await expect.poll(async () => (await servicioGuardado()).payments.length).toBe(2);
  await expect(page.getByRole('heading', { name: 'Registrar Pago' })).toHaveCount(0);
  const aviso = page.getByText(/se registró|registrado/i).filter({ hasText: /Saldo pendiente/ }).first();
  await expect(aviso).toBeVisible();
  const s = await servicioGuardado();
  await expect(aviso).toContainText('$ 100.000');
});

test('4. tras subir el precio, borrar un pago en Gestión de Ventas reabre el servicio terminado', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await crearServicio(page, '100000', '100000');
  await editarPrecio(page, '150000');
  await pagar(page, '50000');
  await expect.poll(async () => (await servicioGuardado()).payments.length).toBe(2);
  await page.getByRole('button', { name: 'Finalizar Servicio Técnico' }).click();
  await expect.poll(async () => (await servicioGuardado()).status).toBe('completed');

  await page.goto('/');
  await irA(page, 'Gestión de Ventas');
  await page.locator('tr:visible').filter({ hasText: '$ 50.000' }).locator('[title="Eliminar venta"]').first().click();
  await page.getByRole('button', { name: 'Eliminar Venta' }).last().click();
  await expect.poll(async () => (await ventasDeServicio()).length).toBe(1);

  const s = await servicioGuardado();
  const pagado = s.payments.reduce((t, p) => t + p.amount, 0);
  expect(s.status).toBe('active');
});

test('5. con precio total, agregar un repuesto no sube lo que paga el cliente', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await crearServicio(page, '150000', '50000');

  await page.getByRole('button', { name: 'Agregar Repuesto' }).click();
  await page.locator('#partName').fill('Pantalla');
  await page.locator('#partCost').fill('40000');
  await page.getByRole('button', { name: 'Agregar Repuesto' }).last().click();
  await expect.poll(async () => (await servicioGuardado()).items.length).toBe(1);

  const s = await servicioGuardado();
  expect(s.serviceCost).toBe(150000);
  expect(s.totalAmount).toBe(150000);
  expect(s.remainingBalance).toBe(100000);
  expect(s.laborCost).toBe(110000);
});

test('6. borrar en Gestión de Ventas un pago hecho con saldo a favor le devuelve el saldo al cliente', async ({ page }) => {
  const clienteId = await prepararTaller(50000);
  await iniciarSesion(page, ADMIN);
  await crearServicio(page, '150000', '0');
  await pagar(page, '50000', true);
  await expect.poll(() => saldoDe(clienteId)).toBe(0);

  await page.goto('/');
  await irA(page, 'Gestión de Ventas');
  await page.locator('tr:visible').filter({ hasText: '$ 100.000' }).locator('[title="Eliminar venta"]').first().click();
  await page.getByRole('button', { name: 'Eliminar Venta' }).last().click();

  await expect.poll(async () => (await ventasDeServicio()).length).toBe(0);
  await expect.poll(() => saldoDe(clienteId)).toBe(50000);
  expect((await servicioGuardado()).payments).toHaveLength(0);
});
