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

/** Copia del servicio terminado para otra clienta, pagada por transferencia. */
async function servicioPorTransferencia(): Promise<void> {
  const clienteId = await crearCliente('Beatriz Gómez');
  const servicio = await servicioGuardado();
  const original: Partial<typeof servicio> = { ...servicio };
  delete original.id;
  await addDoc(collection(db, COLLECTIONS.TECHNICAL_SERVICES), {
    ...original,
    customerId: clienteId,
    customerName: 'Beatriz Gómez',
    payments: servicio.payments.map(p => ({
      ...p,
      id: `${p.id}-t`,
      paymentMethod: 'transferencia',
      paymentMethods: [{ method: 'transferencia', amount: p.amount, commission: 0 }],
    })),
  });
}

test('en Liquidación el filtro de método de pago deja ver solo los servicios pagados por transferencia', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await servicioTerminado(page);
  await servicioPorTransferencia();

  await page.goto('/');
  await irA(page, 'Liquidación de Técnicos');
  await expect(page.getByRole('button', { name: 'Servicios Pendientes (2)' })).toBeVisible();

  const metodo = page.locator('label', { hasText: 'Método de pago' }).locator('xpath=following-sibling::select');
  await metodo.selectOption({ label: 'Transferencia' });
  await expect(page.getByRole('button', { name: 'Servicios Pendientes (1)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Beatriz Gómez' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Andrés Ríos' })).toHaveCount(0);
  await expect(page.getByText('Pagó: Transferencia')).toBeVisible();

  await metodo.selectOption({ label: 'Efectivo' });
  await expect(page.getByRole('heading', { name: 'Andrés Ríos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Beatriz Gómez' })).toHaveCount(0);
});

test('en el Historial de Servicio Técnico el filtro de método de pago deja ver solo los pagados por transferencia', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await servicioTerminado(page);
  await servicioPorTransferencia();

  await page.goto('/');
  await irA(page, 'Centro de Servicios Técnicos');
  await expect(page.getByText('Beatriz Gómez').first()).toBeVisible();
  await expect(page.getByText('Andrés Ríos').first()).toBeVisible();

  await page.locator('label', { hasText: 'Método de Pago' }).locator('xpath=following-sibling::select').selectOption({ label: 'Transferencia' });
  await expect(page.getByText('Beatriz Gómez').first()).toBeVisible();
  await expect(page.getByText('Andrés Ríos')).toHaveCount(0);
});

const selectDe = (page: Page, etiqueta: string) =>
  page.locator('label', { hasText: etiqueta }).locator('xpath=following-sibling::select');

async function servicioMixto(): Promise<void> {
  const clienteId = await crearCliente('Carlos Mejía');
  const servicio = await servicioGuardado();
  const original: Partial<typeof servicio> = { ...servicio };
  delete original.id;
  await addDoc(collection(db, COLLECTIONS.TECHNICAL_SERVICES), {
    ...original, customerId: clienteId, customerName: 'Carlos Mejía',
    payments: [{ ...servicio.payments[0], id: 'mixto', paymentMethod: 'efectivo',
      paymentMethods: [{ method: 'efectivo', amount: 50000, commission: 0 }, { method: 'transferencia', amount: 100000, commission: 0 }] }],
  });
}

test('en Liquidación el método de pago se combina con la búsqueda y el técnico', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await servicioTerminado(page);
  await servicioPorTransferencia();
  await page.goto('/');
  await irA(page, 'Liquidación de Técnicos');
  await selectDe(page, 'Método de pago').selectOption({ label: 'Transferencia' });
  await page.getByPlaceholder('Cliente, técnico, dispositivo...').fill('Andrés');
  await expect(page.getByRole('button', { name: 'Servicios Pendientes (0)' })).toBeVisible();
  await page.getByPlaceholder('Cliente, técnico, dispositivo...').fill('Beatriz');
  await expect(page.getByRole('button', { name: 'Servicios Pendientes (1)' })).toBeVisible();
  await selectDe(page, 'Técnico').selectOption({ label: 'Técnico Uno' });
  await expect(page.getByRole('button', { name: 'Servicios Pendientes (1)' })).toBeVisible();
  await page.getByPlaceholder('Cliente, técnico, dispositivo...').fill('');
  await selectDe(page, 'Método de pago').selectOption({ label: 'Tarjeta' });
  await expect(page.getByRole('button', { name: 'Servicios Pendientes (0)' })).toBeVisible();
  // El historial de liquidaciones no tiene filtro de método.
  await page.getByRole('button', { name: /Historial de Liquidaciones/ }).click();
  await expect(selectDe(page, 'Método de pago')).toHaveCount(0);
});

test('filtrar por transferencia, seleccionar todo y liquidar solo liquida los de transferencia', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await servicioTerminado(page);
  await servicioPorTransferencia();
  await page.goto('/');
  await irA(page, 'Liquidación de Técnicos');
  await selectDe(page, 'Método de pago').selectOption({ label: 'Transferencia' });
  await page.getByRole('button', { name: 'Seleccionar todo' }).click();
  await page.getByRole('button', { name: 'Crear Liquidación (1)' }).click();
  await page.getByRole('button', { name: 'Crear Liquidaciones' }).click();
  await expect.poll(async () => (await documentos(COLLECTIONS.TECHNICIAN_LIQUIDATIONS)).length).toBe(1);
  const servicios = await documentos<TechnicalService>(COLLECTIONS.TECHNICAL_SERVICES);
  expect(servicios.find(s => s.customerName === 'Beatriz Gómez')?.liquidationId).toBeTruthy();
  expect(servicios.find(s => s.customerName === 'Andrés Ríos')?.liquidationId).toBeFalsy();
  await selectDe(page, 'Método de pago').selectOption({ label: 'Todos los métodos' });
  await expect(page.getByRole('button', { name: 'Servicios Pendientes (1)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Andrés Ríos' })).toBeVisible();
});

test('al cambiar el método de pago se desmarcan los servicios seleccionados', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await servicioTerminado(page);
  await servicioPorTransferencia();
  await page.goto('/');
  await irA(page, 'Liquidación de Técnicos');
  await page.getByRole('heading', { name: 'Andrés Ríos' }).locator('xpath=ancestor::div[.//input[@type="checkbox"]][1]')
    .locator('input[type="checkbox"]').check();
  await expect(page.getByRole('button', { name: 'Crear Liquidación (1)' })).toBeVisible();
  await selectDe(page, 'Método de pago').selectOption({ label: 'Transferencia' });
  await expect(page.getByRole('button', { name: /Crear Liquidación \(/ })).toHaveCount(0);
});

test('en el Historial el método de pago se combina con estado, estado de pago y período', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await servicioTerminado(page);
  await servicioPorTransferencia();
  await page.goto('/');
  await irA(page, 'Centro de Servicios Técnicos');
  await selectDe(page, 'Método de Pago').selectOption({ label: 'Transferencia' });
  await selectDe(page, 'Estado').first().selectOption('completed');
  await expect(page.getByText('Beatriz Gómez').first()).toBeVisible();
  await selectDe(page, 'Estado').first().selectOption('active');
  await expect(page.getByText('Beatriz Gómez')).toHaveCount(0);
  await selectDe(page, 'Estado').first().selectOption('all');
  await selectDe(page, 'Estado de Pago').selectOption('pending');
  await expect(page.getByText('Beatriz Gómez')).toHaveCount(0);
  await selectDe(page, 'Estado de Pago').selectOption('paid');
  await expect(page.getByText('Beatriz Gómez').first()).toBeVisible();
  await expect(page.getByText('Andrés Ríos')).toHaveCount(0);
  await selectDe(page, 'Período').first().selectOption('yesterday');
  await expect(page.getByText('Beatriz Gómez')).toHaveCount(0);
});

test('en el Historial, con un método elegido, Ingresos suma solo lo recibido con ese método', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await servicioTerminado(page);
  await servicioMixto();
  await page.goto('/');
  await irA(page, 'Centro de Servicios Técnicos');
  await selectDe(page, 'Método de Pago').selectOption({ label: 'Transferencia' });
  await expect(page.getByText('Carlos Mejía').first()).toBeVisible();
  const ingresos = page.getByText('Ingresos', { exact: true }).first().locator('xpath=following-sibling::p');
  // Carlos pagó 50.000 en efectivo y 100.000 por transferencia.
  await expect(ingresos).toHaveText('$ 100.000');
  await selectDe(page, 'Método de Pago').selectOption({ label: 'Efectivo' });
  await expect(page.getByText('Andrés Ríos').first()).toBeVisible();
  await expect(page.getByText('Carlos Mejía').first()).toBeVisible();
  // Andrés 150.000 en efectivo más la parte en efectivo de Carlos.
  await expect(ingresos).toHaveText('$ 200.000');
});

test('un servicio marcado y luego oculto con la búsqueda no se liquida', async ({ page }) => {
  await prepararTaller();
  await iniciarSesion(page, ADMIN);
  await servicioTerminado(page);
  await servicioPorTransferencia();
  await page.goto('/');
  await irA(page, 'Liquidación de Técnicos');
  await page.getByRole('heading', { name: 'Andrés Ríos' }).locator('xpath=ancestor::div[.//input[@type="checkbox"]][1]')
    .locator('input[type="checkbox"]').check();
  await expect(page.getByRole('button', { name: 'Crear Liquidación (1)' })).toBeVisible();

  await page.getByPlaceholder('Cliente, técnico, dispositivo...').fill('Beatriz');
  await expect(page.getByRole('heading', { name: 'Andrés Ríos' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Crear Liquidación \(/ })).toHaveCount(0);

  // Al volver a mostrarlo sigue sin marcar.
  await page.getByPlaceholder('Cliente, técnico, dispositivo...').fill('');
  await expect(page.getByRole('heading', { name: 'Andrés Ríos' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Crear Liquidación \(/ })).toHaveCount(0);
});
