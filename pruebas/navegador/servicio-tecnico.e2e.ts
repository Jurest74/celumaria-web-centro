// Servicio técnico desde la pantalla: cobro, cierre, parte del técnico y
// cancelación con devolución de dinero.
import { expect, test, type Page } from '@playwright/test';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import type { Sale, TechnicalService } from '../../src/types';
import { ADMIN, crearCliente, crearUsuario, documentos, iniciarSesion, irA, limpiarTodo } from './apoyo';

test.beforeEach(async () => {
  await limpiarTodo();
});

async function servicioGuardado(): Promise<TechnicalService & { id: string }> {
  const [servicio] = await documentos<TechnicalService>(COLLECTIONS.TECHNICAL_SERVICES);
  return servicio;
}

async function pagosEnVentas(): Promise<number[]> {
  return (await documentos<Sale>(COLLECTIONS.SALES))
    .filter(v => v.type === 'technical_service_payment')
    .map(v => v.total)
    .sort((a, b) => a - b);
}

async function prepararTaller(): Promise<void> {
  await crearUsuario(ADMIN, 'admin');
  await crearCliente('Andrés Ríos');
  await addDoc(collection(db, COLLECTIONS.TECHNICIANS), { name: 'Técnico Uno', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
}

async function crearServicio(page: Page, opciones: { costo: string; repuesto?: { nombre: string; costo: string }; abono: string }) {
  await irA(page, 'Servicio Técnico');
  await page.getByRole('button', { name: 'Nuevo Servicio Técnico' }).click();
  await page.getByPlaceholder('Buscar cliente por nombre, teléfono o email...').fill('Andrés Ríos');
  await page.getByRole('button', { name: /Andrés Ríos -/ }).click();
  await page.getByRole('textbox', { name: 'Marca y Referencia del Equipo' }).fill('Samsung A54');
  await page.getByRole('textbox', { name: 'Falla Reportada *' }).fill('Pantalla rota');
  await page.getByRole('textbox', { name: 'Costo Servicio Técnico *' }).fill(opciones.costo);
  await page.getByRole('combobox', { name: 'Técnico Asignado' }).selectOption({ label: 'Técnico Uno' });
  if (opciones.repuesto) {
    await page.getByRole('textbox', { name: 'Nombre del repuesto' }).fill(opciones.repuesto.nombre);
    await page.getByRole('textbox', { name: 'Costo unitario' }).fill(opciones.repuesto.costo);
    await page.getByRole('button', { name: 'Agregar Repuesto (Opcional)' }).click();
  }
  await page.getByText('Monto (COP)').locator('xpath=following::input[1]').fill(opciones.abono);
  await page.getByRole('button', { name: 'Crear Servicio Técnico' }).click();
  if (!opciones.repuesto) {
    // Sin repuestos la pantalla pide confirmar.
    await page.getByRole('button', { name: 'Confirmar' }).click();
  }
  // Tras crear se abre el diálogo de impresión.
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Ver detalles' }).click();
  await expect(page.getByRole('heading', { name: 'Servicio Técnico - Andrés Ríos' })).toBeVisible();
}

test('servicio completo: crear con abono, instalar repuesto, pagar el saldo y finalizar', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);

  await crearServicio(page, { costo: '150000', repuesto: { nombre: 'Pantalla', costo: '40000' }, abono: '50000' });

  let servicio = await servicioGuardado();
  expect(servicio.serviceCost).toBe(150000);
  expect(servicio.laborCost).toBe(110000);
  expect(servicio.technicianShare).toBe(55000);
  expect(await pagosEnVentas()).toEqual([50000]);
  await expect(page.getByRole('button', { name: 'Finalizar Servicio Técnico' })).toBeDisabled();

  // Instalar el repuesto.
  await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Instalado' }) }).selectOption({ label: 'Instalado' });
  await expect.poll(async () => (await servicioGuardado()).items[0].status).toBe('instalado');

  // Pagar el saldo.
  await page.getByRole('button', { name: 'Registrar Pago' }).first().click();
  const dialogo = page.getByRole('heading', { name: 'Registrar Pago' }).locator('xpath=ancestor::div[.//textarea or .//input][1]');
  await dialogo.getByRole('textbox', { name: '0' }).fill('100000');
  await page.getByRole('button', { name: 'Registrar Pago' }).last().click();
  await expect.poll(pagosEnVentas).toEqual([50000, 100000]);
  expect((await servicioGuardado()).remainingBalance).toBe(0);

  // Finalizar.
  await page.getByRole('button', { name: 'Finalizar Servicio Técnico' }).click();
  await expect.poll(async () => (await servicioGuardado()).status).toBe('completed');
  servicio = await servicioGuardado();
  expect(servicio.completedAt).toBeTruthy();

  // Liquidar al técnico: se le pagan 55.000 (50 % de 150.000 − 40.000).
  await page.goto('/');
  await irA(page, 'Liquidación de Técnicos');
  await expect(page.getByRole('button', { name: 'Servicios Pendientes (1)' })).toBeVisible();
  await page.getByRole('heading', { name: 'Andrés Ríos' }).locator('xpath=ancestor::div[.//input[@type="checkbox"]][1]')
    .locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Crear Liquidación (1)' }).click();
  await page.getByRole('button', { name: 'Crear Liquidaciones' }).click();

  await expect.poll(async () => (await documentos(COLLECTIONS.TECHNICIAN_LIQUIDATIONS)).length).toBe(1);
  const [liquidacion] = await documentos<{ totalTechnicianShare: number; totalLaborCost: number; services: unknown[] }>(COLLECTIONS.TECHNICIAN_LIQUIDATIONS);
  expect(liquidacion.totalLaborCost).toBe(110000);
  expect(liquidacion.totalTechnicianShare).toBe(55000);
  expect(liquidacion.services).toHaveLength(1);
  expect((await servicioGuardado()).liquidationId).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Servicios Pendientes (0)' })).toBeVisible();
});

test('editar el precio recalcula la mano de obra y la parte del técnico', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await crearServicio(page, { costo: '100000', abono: '0' });
  expect((await servicioGuardado()).technicianShare).toBe(50000);

  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByText('Costo Total del Servicio Técnico').locator('xpath=following::input[1]').fill('200000');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect.poll(async () => (await servicioGuardado()).serviceCost).toBe(200000);
  const servicio = await servicioGuardado();
  expect(servicio.laborCost).toBe(200000);
  expect(servicio.technicianShare).toBe(100000);
  expect(servicio.businessShare).toBe(100000);
});

test('cancelar con devolución: registra el egreso y deja lo retenido como ingreso', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await crearServicio(page, { costo: '120000', abono: '50000' });

  // El cliente pagó 50.000: se le devuelven 30.000 y se retienen 20.000.
  await page.getByRole('button', { name: 'Cancelar Servicio Técnico', exact: true }).click();
  await page.getByPlaceholder('Ej: 20000').fill('30000');
  await page.getByPlaceholder('Ej: 15000').fill('20000');
  await page.getByRole('button', { name: 'Cancelar Servicio', exact: true }).click();

  await expect.poll(async () => (await servicioGuardado()).status).toBe('cancelled');
  const servicio = await servicioGuardado();
  expect(servicio.payments.map(p => p.amount).sort((x, y) => x - y)).toEqual([-30000, 50000]);
  // En ventas queda el ingreso original y el egreso de la devolución: neto 20.000.
  expect(await pagosEnVentas()).toEqual([-30000, 50000]);

  // Cancelar otra vez no registra una segunda devolución.
  await page.goto('/');
  await irA(page, 'Servicio Técnico');
  expect(await pagosEnVentas()).toEqual([-30000, 50000]);
});
