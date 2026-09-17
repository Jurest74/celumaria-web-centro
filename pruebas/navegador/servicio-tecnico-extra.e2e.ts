// Servicio técnico: eliminar un repuesto cuando el cliente ya pagó.
import { expect, test } from '@playwright/test';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { technicalServicesService } from '../../src/services/firebase/firestore';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import type { TechnicalService } from '../../src/types';
import { ADMIN, crearCliente, crearUsuario, documentos, iniciarSesion, irA, limpiarTodo, saldoDe } from './apoyo';

test.beforeEach(async () => {
  await limpiarTodo();
});

async function servicio(): Promise<TechnicalService & { id: string }> {
  return (await documentos<TechnicalService>(COLLECTIONS.TECHNICAL_SERVICES))[0];
}

test('eliminar un repuesto de un servicio pagado no puede devolverle dinero al cliente y dejarlo debiendo a la vez', async ({ page }) => {
  await crearUsuario(ADMIN, 'admin');
  const clienteId = await crearCliente('Mario León', 0);
  await addDoc(collection(db, COLLECTIONS.TECHNICIANS), { name: 'Técnico Uno', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

  // Precio total 150.000, con un repuesto de 40.000, pagado completo.
  await technicalServicesService.add({
    items: [{ id: 'r1', partName: 'Pantalla', quantity: 1, partCost: 40000, totalCost: 40000, status: 'solicitado' }],
    totalAmount: 150000, totalCost: 40000, expectedProfit: 55000,
    customerId: clienteId, customerName: 'Mario León', deviceBrandModel: 'Moto G',
    downPayment: 0, remainingBalance: 0, status: 'active',
    payments: [{ id: 'p1', amount: 150000, paymentDate: new Date().toISOString(), paymentMethod: 'efectivo' }],
    serviceCost: 150000, laborCost: 110000, technicianShare: 55000, businessShare: 55000,
    technicianName: 'Técnico Uno',
  } as Omit<TechnicalService, 'id' | 'createdAt' | 'updatedAt'>);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Servicio Técnico');
  await page.getByRole('button', { name: 'Ver detalles' }).first().click();
  await page.locator('[title="Eliminar repuesto"]').first().click();

  // Si la pantalla ofrece manejar un sobrepago, se elige saldo a favor.
  const opcionSaldo = page.locator('input[name="overpaymentAction"][value="credit"]');
  if (await opcionSaldo.count()) {
    await opcionSaldo.first().check();
  }
  await page.getByRole('button', { name: 'Eliminar Repuesto', exact: true }).click();

  // La pantalla guarda el servicio y después acredita el saldo: se espera a
  // que termine todo (el aviso final) antes de leer.
  await expect(page.getByText('Repuesto eliminado').first()).toBeVisible();
  const guardado = await servicio();
  expect(guardado.items).toHaveLength(0);

  // Lo que la pantalla muestra como pendiente: precio total − pagado neto.
  const precio = guardado.serviceCost ?? 0;
  const pagadoNeto = guardado.payments.reduce((s, p) => s + p.amount, 0);
  const pendiente = precio - pagadoNeto;
  const acreditado = await saldoDe(clienteId);

  console.log(`precio=${precio} pagadoNeto=${pagadoNeto} pendiente=${pendiente} acreditado=${acreditado} manoDeObra=${guardado.laborCost} parteTecnico=${guardado.technicianShare}`);

  // Invariante: no se le puede devolver dinero y a la vez quedar debiendo.
  expect(acreditado > 0 && pendiente > 0).toBe(false);
});

test('servicio con precio total: eliminar un repuesto mantiene el precio, no genera sobrepago y pasa ese valor a mano de obra', async ({ page }) => {
  // Regla del negocio: en un servicio con precio total, el cliente paga el
  // precio acordado; quitar un repuesto solo cambia cuánto es mano de obra.
  await crearUsuario(ADMIN, 'admin');
  const clienteId = await crearCliente('Mario León', 0);
  await addDoc(collection(db, COLLECTIONS.TECHNICIANS), { name: 'Técnico Uno', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await technicalServicesService.add({
    items: [{ id: 'r1', partName: 'Pantalla', quantity: 1, partCost: 40000, totalCost: 40000, status: 'solicitado' }],
    totalAmount: 150000, totalCost: 40000, expectedProfit: 55000,
    customerId: clienteId, customerName: 'Mario León', deviceBrandModel: 'Moto G',
    downPayment: 0, remainingBalance: 0, status: 'active',
    payments: [{ id: 'p1', amount: 150000, paymentDate: new Date().toISOString(), paymentMethod: 'efectivo' }],
    serviceCost: 150000, laborCost: 110000, technicianShare: 55000, businessShare: 55000,
    technicianName: 'Técnico Uno',
  } as Omit<TechnicalService, 'id' | 'createdAt' | 'updatedAt'>);

  await iniciarSesion(page, ADMIN);
  await irA(page, 'Servicio Técnico');
  await page.getByRole('button', { name: 'Ver detalles' }).first().click();
  await page.locator('[title="Eliminar repuesto"]').first().click();

  // No debe pedir cómo manejar un sobrepago: no lo hay.
  await expect(page.getByText('Sobrepago Detectado')).toHaveCount(0);
  await page.getByRole('button', { name: 'Eliminar Repuesto', exact: true }).click();
  await expect(page.getByText('Repuesto eliminado').first()).toBeVisible();

  const guardado = await servicio();
  expect(guardado.items).toHaveLength(0);
  expect(guardado.serviceCost).toBe(150000);
  expect(guardado.payments.map(p => p.amount)).toEqual([150000]);
  expect(await saldoDe(clienteId)).toBe(0);
  expect(guardado.laborCost).toBe(150000);
  expect(guardado.technicianShare).toBe(75000);
});
