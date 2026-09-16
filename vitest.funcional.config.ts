import { defineConfig } from 'vitest/config';

// Pruebas funcionales del core contra el emulador local de Firebase.
// No corren con `npm test`: se lanzan con `npm run pruebas:servicios`, que
// levanta el emulador, ejecuta las pruebas y lo apaga (los datos desaparecen).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['pruebas/servicios/**/*.funcional.ts'],
    setupFiles: ['pruebas/servicios/preparacion.ts'],
    env: { VITE_EMULADOR: 'true' },
    // Todas las pruebas comparten el mismo emulador: una a la vez.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
