// Liquidación de técnicos: pendientes de cualquier fecha y servicios
// liquidados que quedan cerrados. Las tres pruebas fallaban antes de la
// corrección (auditoría del 2026-10-04).
import { expect, test, type Page } from '@playwright/test';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import { subtractDaysBogota } from '../../src/utils/dateUtils';
import type { TechnicalService } from '../../src/types';
import { ADMIN, crearCliente, crearUsuario, documentos, iniciarSesion, irA, limpiarTodo } from './apoyo';

test.beforeEach(async () => {
  await limpiarTodo();
});

async function servicioGuardado(): Promise<TechnicalService & { id: string }> {
  const [servicio] = await documentos<TechnicalService>(COLLECTIONS.TECHNICAL_SERVICES);
  return servicio;
}

async function prepararTaller(): Promise<string> {
  await crearUsuario(ADMIN, 'admin');
  const clienteId = await crearCliente('Andrés Ríos');
  await addDoc(collection(db, COLLECTIONS.TECHNICIANS), { name: 'Técnico Uno', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  return clienteId;
}

/** Crea un servicio de 150.000 sin repuestos, pagado completo, y lo finaliza. */
async function servicioTerminado(page: Page) {
  await irA(page, 'Servicio Técnico');
  await page.getByRole('button', { name: 'Nuevo Servicio Técnico' }).click();
  await page.getByPlaceholder('Buscar cliente por nombre, teléfono o email...').fill('Andrés Ríos');
  await page.getByRole('button', { name: /Andrés Ríos -/ }).click();
  await page.getByRole('textbox', { name: 'Marca y Referencia del Equipo' }).fill('Samsung A54');
  await page.getByRole('textbox', { name: 'Falla Reportada *' }).fill('Pantalla rota');
  await page.getByRole('textbox', { name: 'Costo Servicio Técnico *' }).fill('150000');
  await page.getByRole('combobox', { name: 'Técnico Asignado' }).selectOption({ label: 'Técnico Uno' });
  await page.getByText('Monto (COP)').locator('xpath=following::input[1]').fill('150000');
  await page.getByRole('button', { name: 'Crear Servicio Técnico' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Ver detalles' }).click();
  await page.getByRole('button', { name: 'Finalizar Servicio Técnico' }).click();
  await expect.poll(async () => (await servicioGuardado()).status).toBe('completed');
}

/** Además lo liquida: 75.000 al técnico. */
async function servicioLiquidado(page: Page) {
  await servicioTerminado(page);
  await page.goto('/');
  await irA(page, 'Liquidación de Técnicos');
  await page.getByRole('heading', { name: 'Andrés Ríos' }).locator('xpath=ancestor::div[.//input[@type="checkbox"]][1]')
    .locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Crear Liquidación (1)' }).click();
  await page.getByRole('button', { name: 'Crear Liquidaciones' }).click();
  await expect.poll(async () => (await servicioGuardado()).liquidationId).toBeTruthy();
  const [liq] = await documentos<{ totalTechnicianShare: number }>(COLLECTIONS.TECHNICIAN_LIQUIDATIONS);
  expect(liq.totalTechnicianShare).toBe(75000);
}

test('un servicio terminado hace días y sin liquidar aparece en Pendientes al abrir la pantalla', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await servicioTerminado(page);
  // Como si se hubiera terminado hace 3 días.
  const servicio = await servicioGuardado();
  await updateDoc(doc(db, COLLECTIONS.TECHNICAL_SERVICES, servicio.id), {
    completedAt: new Date(`${subtractDaysBogota(3)}T15:00:00.000-05:00`).toISOString(),
  });

  await page.goto('/');
  await irA(page, 'Liquidación de Técnicos');
  await expect(page.getByRole('button', { name: 'Servicios Pendientes (1)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Andrés Ríos' })).toBeVisible();
});

test('borrar en Gestión de Ventas el pago de un servicio ya liquidado se bloquea y el servicio sigue cerrado', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await servicioLiquidado(page);

  await page.goto('/');
  await irA(page, 'Gestión de Ventas');
  await page.locator('tr:visible').filter({ hasText: '$ 150.000' }).locator('[title="Eliminar venta"]').first().click();
  await page.getByRole('button', { name: 'Eliminar Venta' }).last().click();

  await expect(page.getByText(/ya se le liquidó al técnico/).first()).toBeVisible();
  const servicio = await servicioGuardado();
  expect(servicio.status).toBe('completed');
  expect(servicio.remainingBalance).toBe(0);
  const pagos = (await documentos<{ type?: string }>(COLLECTIONS.SALES)).filter(v => v.type === 'technical_service_payment');
  expect(pagos).toHaveLength(1);
});

test('a un servicio ya liquidado no se le pueden agregar repuestos', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await servicioLiquidado(page);

  await page.goto('/');
  await irA(page, 'Servicio Técnico');
  await page.locator('select').filter({ has: page.locator('option[value="completed"]') }).first().selectOption('completed');
  await page.getByRole('button', { name: 'Ver detalles' }).click();
  await expect(page.getByRole('heading', { name: 'Repuestos del Servicio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar Repuesto' })).toHaveCount(0);
});
