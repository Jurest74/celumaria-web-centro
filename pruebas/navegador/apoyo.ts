// Apoyo para las pruebas de navegador: datos de prueba y pasos comunes.
import { expect, type Page } from '@playwright/test';
import { doc, setDoc } from 'firebase/firestore';
import { db, PROYECTO_PRUEBAS } from '../../src/config/firebase';
import { DEFAULT_PERMISSIONS } from '../../src/utils/permissions';
import { limpiarEmulador } from '../servicios/ayudas';

export * from '../servicios/ayudas';

const HOST = process.env.VITE_EMULADOR_HOST || '127.0.0.1';

export const ADMIN = { email: 'admin@pruebas.local', clave: 'Clave-Prueba-123', nombre: 'Admin Pruebas' };
export const CAJERA = { email: 'caja@pruebas.local', clave: 'Clave-Prueba-123', nombre: 'Caja Pruebas' };

/** Deja Firestore y Auth del emulador vacíos. */
export async function limpiarTodo(): Promise<void> {
  await limpiarEmulador();
  const r = await fetch(`http://${HOST}:9099/emulator/v1/projects/${PROYECTO_PRUEBAS}/accounts`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`No se pudo limpiar Auth del emulador (${r.status})`);
}

/** Crea un usuario en el Auth del emulador y su documento en /users. */
export async function crearUsuario(u: { email: string; clave: string; nombre: string }, rol: 'admin' | 'employee'): Promise<string> {
  const r = await fetch(`http://${HOST}:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=clave-emulador`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: u.clave, returnSecureToken: true }),
  });
  const cuerpo = await r.json();
  if (!r.ok) throw new Error(`No se pudo crear el usuario de prueba: ${JSON.stringify(cuerpo)}`);
  const uid = cuerpo.localId as string;
  const ahora = new Date().toISOString();
  await setDoc(doc(db, 'users', uid), {
    uid,
    email: u.email,
    displayName: u.nombre,
    role: rol,
    permissions: DEFAULT_PERMISSIONS[rol],
    isActive: true,
    createdAt: ahora,
    updatedAt: ahora,
    lastLoginAt: ahora,
  });
  return uid;
}

export async function iniciarSesion(page: Page, u: { email: string; clave: string }): Promise<void> {
  await page.goto('/');
  await page.getByPlaceholder('Ingresa tu email').fill(u.email);
  await page.getByPlaceholder('Ingresa tu contraseña').fill(u.clave);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByPlaceholder('Ingresa tu email')).toHaveCount(0);
}

const CATEGORIA_DE: Record<string, string> = {
  'Productos': 'Inventario', 'Compras': 'Inventario', 'Categorías': 'Inventario',
  'Reportes': 'Análisis', 'Gestión de Ventas': 'Análisis', 'Gestión de Compras': 'Análisis',
  'Centro de Servicios Técnicos': 'Análisis',
  'Gestión de Usuarios': 'Configuración', 'Gestión de Técnicos': 'Configuración',
};

/** Navega usando el menú lateral, como lo haría una persona. */
export async function irA(page: Page, seccion: string): Promise<void> {
  const boton = page.getByRole('button', { name: seccion, exact: true }).first();
  if (!(await boton.isVisible())) {
    // Abrir el menú (se expande al pasar el mouse) y la categoría que contiene la sección.
    await page.locator('[title="Panel de Control"], [title="Operaciones"]').first().hover();
    const categoria = CATEGORIA_DE[seccion];
    if (categoria && !(await boton.isVisible())) {
      await page.getByText(categoria, { exact: true }).first().click();
    }
  }
  if (await boton.isVisible()) {
    await boton.click();
  } else {
    await page.locator(`[title="${seccion}"]`).first().click();
  }
  await page.mouse.move(900, 450);
}

export async function confirmar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Confirmar' }).click();
}

/** Abre el detalle de un plan separe desde su pantalla. */
export async function abrirDetallePlan(page: Page, cliente: string): Promise<void> {
  const detalle = page.getByRole('heading', { name: `Plan Separe - ${cliente}` });
  if (!(await detalle.isVisible())) {
    await page.getByRole('combobox').first().selectOption({ label: 'Todos los estados' });
    await page.getByRole('heading', { name: cliente, level: 3 }).locator('xpath=ancestor::div[.//button[@title="Ver detalles" or @aria-label="Ver detalles" or normalize-space()="Ver detalles"]][1]')
      .getByRole('button', { name: 'Ver detalles' }).first().click();
  }
  await expect(detalle).toBeVisible();
}

/** Registra un pago desde el diálogo "Registrar Pago" (plan separe o servicio técnico). */
export async function registrarPagoEnDialogo(page: Page, monto: string, antes?: (page: Page) => Promise<void>): Promise<void> {
  await page.getByRole('button', { name: 'Registrar Pago' }).first().click();
  if (antes) await antes(page);
  const dialogo = page.getByRole('heading', { name: 'Registrar Pago' }).locator('xpath=ancestor::div[.//textarea or .//input][1]');
  await dialogo.getByRole('textbox', { name: '0' }).fill(monto);
  await page.getByRole('button', { name: 'Registrar Pago' }).last().click();
}
