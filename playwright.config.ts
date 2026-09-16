import { defineConfig, devices } from '@playwright/test';

// Pruebas de navegador: la app real, abierta en Chromium, contra el emulador
// local de Firebase con datos de prueba. Se lanzan con
// `npm run pruebas:navegador`, que levanta el emulador y lo apaga al final.
process.env.VITE_EMULADOR = 'true';

const PUERTO = 5199;

export default defineConfig({
  testDir: 'pruebas/navegador',
  testMatch: '**/*.e2e.ts',
  // Un solo emulador compartido: los flujos corren uno a la vez.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'pruebas/reporte-navegador', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PUERTO}`,
    locale: 'es-CO',
    // La tienda opera en Colombia: el navegador de prueba también.
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npx vite --port ${PUERTO} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PUERTO}`,
    env: { VITE_EMULADOR: 'true' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
