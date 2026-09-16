// Ciclo completo de un plan separe desde la pantalla, verificando stock,
// dinero y registros contables en cada paso.
import { expect, test, type Page } from '@playwright/test';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import type { LayawayPlan, Sale } from '../../src/types';
import {
  ADMIN, crearCliente, crearProducto, crearUsuario, documentos, iniciarSesion, irA, limpiarTodo, saldoDe, stockDe,
} from './apoyo';

test.beforeEach(async () => {
  await limpiarTodo();
});

async function planGuardado(): Promise<LayawayPlan & { id: string }> {
  const [plan] = await documentos<LayawayPlan>(COLLECTIONS.LAYAWAYS);
  return plan;
}

async function ventasDePlan(tipo: Sale['type']): Promise<Sale[]> {
  return (await documentos<Sale>(COLLECTIONS.SALES)).filter(v => v.type === tipo);
}

async function confirmar(page: Page) {
  await page.getByRole('button', { name: 'Confirmar' }).click();
}

async function crearPlanDesdePantalla(page: Page, cliente: string, producto: RegExp, abonoInicial: string) {
  await irA(page, 'Plan Separe');
  await page.getByRole('button', { name: 'Nuevo Plan Separe' }).click();
  await page.getByPlaceholder('Buscar cliente por nombre, teléfono o email...').fill(cliente);
  await page.getByRole('button', { name: new RegExp(`${cliente} -`) }).click();
  await page.getByPlaceholder('Buscar producto...').fill(producto.source.split(' ')[0]);
  await page.getByRole('button', { name: producto }).click();
  await page.getByRole('spinbutton').locator('xpath=following-sibling::button[1]').click();
  await page.getByRole('textbox', { name: '0' }).first().fill(abonoInicial);
  await page.getByRole('button', { name: 'Crear Plan Separe' }).click();
  await expect(page.getByRole('heading', { name: cliente, level: 3 })).toBeVisible();
}

async function registrarPago(page: Page, monto: string) {
  await page.getByRole('button', { name: 'Registrar Pago' }).first().click();
  const dialogo = page.getByRole('heading', { name: 'Registrar Pago' }).locator('xpath=ancestor::div[.//textarea or .//input][1]');
  await dialogo.getByRole('textbox', { name: '0' }).fill(monto);
  await page.getByRole('button', { name: 'Registrar Pago' }).last().click();
}

async function abrirDetalle(page: Page, cliente: string) {
  const detalle = page.getByRole('heading', { name: `Plan Separe - ${cliente}` });
  if (!(await detalle.isVisible())) {
    await page.getByRole('combobox').first().selectOption({ label: 'Todos los estados' });
    await page.getByRole('button', { name: 'Ver detalles' }).first().click();
  }
  await expect(detalle).toBeVisible();
}

test('ciclo completo: abonos, cancelar un abono, completar, reabrir desde Gestión de Ventas y cancelar', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const celular = await crearProducto('Celular Moto', 3, 500000, 800000);
  // Cliente sin correo: antes este caso impedía crear el plan.
  const clienteId = await crearCliente('Carlos Pérez', 0);

  await iniciarSesion(page, ADMIN);

  // 1. Crear el plan con un abono inicial de 200.000: reserva una unidad.
  await crearPlanDesdePantalla(page, 'Carlos Pérez', /Celular Moto .*Stock: 3/, '200000');
  await expect.poll(async () => (await planGuardado())?.payments?.length).toBe(1);
  let plan = await planGuardado();
  expect(plan.status).toBe('active');
  expect(plan.remainingBalance).toBe(600000);
  expect(await stockDe(celular.id)).toBe(2);
  expect((await ventasDePlan('layaway_payment')).map(v => v.total)).toEqual([200000]);

  // 2. Abonar 300.000.
  await abrirDetalle(page, 'Carlos Pérez');
  await registrarPago(page, '300000');
  await expect.poll(async () => (await planGuardado()).payments.length).toBe(2);
  expect((await planGuardado()).remainingBalance).toBe(300000);

  // 3. Cancelar ese abono: el saldo vuelve y su registro en ventas desaparece.
  await abrirDetalle(page, 'Carlos Pérez');
  await page.locator('div', { has: page.getByRole('button', { name: 'Cancelar pago' }) })
    .filter({ hasText: '$ 300.000' }).last()
    .getByRole('button', { name: 'Cancelar pago' }).click();
  await confirmar(page);
  await expect.poll(async () => (await planGuardado()).payments.length).toBe(1);
  expect((await planGuardado()).remainingBalance).toBe(600000);
  expect((await ventasDePlan('layaway_payment')).map(v => v.total)).toEqual([200000]);

  // 4. Pagar el saldo: el plan se completa y el producto queda entregado,
  //    con su ganancia registrada una sola vez.
  await abrirDetalle(page, 'Carlos Pérez');
  await registrarPago(page, '600000');
  await expect.poll(async () => (await planGuardado()).status).toBe('completed');
  plan = await planGuardado();
  expect(plan.remainingBalance).toBe(0);
  expect(plan.items[0].pickedUpQuantity).toBe(1);
  expect((await ventasDePlan('layaway_payment')).map(v => v.total).sort()).toEqual([200000, 600000]);
  const entregas = await ventasDePlan('layaway_delivery');
  expect(entregas).toHaveLength(1);
  expect(entregas[0].totalProfit).toBe(300000);
  expect(await stockDe(celular.id)).toBe(2); // entregar no vuelve a descontar

  // 5. Borrar el abono de 600.000 desde Gestión de Ventas: el plan se reabre,
  //    se revierte la entrega automática y se borra su registro de entrega.
  await page.goto('/');
  await irA(page, 'Gestión de Ventas');
  await page.locator('tr:visible').filter({ hasText: '$ 600.000' })
    .locator('[title="Eliminar venta"]').first().click();
  await page.getByRole('button', { name: 'Eliminar Venta' }).last().click();

  await expect.poll(async () => (await planGuardado()).status).toBe('active');
  plan = await planGuardado();
  expect(plan.remainingBalance).toBe(600000);
  expect(plan.items[0].pickedUpQuantity).toBe(0);
  expect((await ventasDePlan('layaway_payment')).map(v => v.total)).toEqual([200000]);
  expect(await ventasDePlan('layaway_delivery')).toHaveLength(0);

  // 6. Cancelar el plan: la unidad vuelve al inventario y lo pagado queda
  //    como saldo a favor del cliente.
  await irA(page, 'Plan Separe');
  await abrirDetalle(page, 'Carlos Pérez');
  await page.getByRole('button', { name: 'Cancelar Plan Separe', exact: true }).click();
  await confirmar(page);

  await expect.poll(async () => (await planGuardado()).status).toBe('cancelled');
  expect(await stockDe(celular.id)).toBe(3);
  expect(await saldoDe(clienteId)).toBe(200000);
});
