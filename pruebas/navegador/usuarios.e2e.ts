// Acceso de usuarios desactivados.
import { expect, test } from '@playwright/test';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { CAJERA, crearUsuario, iniciarSesion, irA, limpiarTodo } from './apoyo';

test.beforeEach(async () => {
  await limpiarTodo();
});

test('un usuario desactivado no puede iniciar sesión', async ({ page }) => {
  const uid = await crearUsuario(CAJERA, 'employee');
  await updateDoc(doc(db, 'users', uid), { isActive: false });

  await page.goto('/');
  await page.getByPlaceholder('Ingresa tu email').fill(CAJERA.email);
  await page.getByPlaceholder('Ingresa tu contraseña').fill(CAJERA.clave);
  page.on('dialog', d => d.dismiss());
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText(/usuario está desactivado/i).first()).toBeVisible();
  // Sigue en la pantalla de inicio de sesión: no entró a la app.
  await expect(page.getByPlaceholder('Ingresa tu email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar Sesión' })).toHaveCount(0);
});

test('si se desactiva a un usuario con la sesión abierta, lo saca de la app', async ({ page }) => {
  const uid = await crearUsuario(CAJERA, 'employee');
  await iniciarSesion(page, CAJERA);
  await irA(page, 'Ventas');
  await expect(page.getByRole('heading', { name: 'Ventas', level: 1 })).toBeVisible();

  // El administrador lo desactiva desde otro equipo.
  await updateDoc(doc(db, 'users', uid), { isActive: false });

  await expect(page.getByPlaceholder('Ingresa tu email')).toBeVisible();
  await expect(page.getByText(/usuario está desactivado/i).first()).toBeVisible();
});

test('un usuario activo entra normalmente', async ({ page }) => {
  await crearUsuario(CAJERA, 'employee');
  await iniciarSesion(page, CAJERA);
  await expect(page.getByRole('button', { name: 'Cerrar Sesión' })).toBeVisible();
});
