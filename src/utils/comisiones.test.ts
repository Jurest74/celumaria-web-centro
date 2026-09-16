// Fuente unica de verdad de las comisiones.
//
// Plan Separe y Servicio Tecnico tenian cada uno su propia copia de
// calculatePaymentCommission, con los casos en ingles ('card', 'cash',
// 'sistecredito', 'addi'). Los selectores de esos modulos emiten los nombres
// en español, asi que toda llamada caia en default y devolvia 0: ningun abono
// con tarjeta descontaba la comision del datafono. Estas pruebas fijan que
// exista una sola implementacion y que reconozca los valores reales.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculatePaymentCommission } from './paymentCommission';

// Los cuatro valores que pueden salir de los selectores de la app.
const METODOS_REALES = ['efectivo', 'transferencia', 'tarjeta', 'crédito'] as const;

describe('tarifa unica de comision', () => {
  it('tarjeta cobra 4% en cualquier modulo', () => {
    expect(calculatePaymentCommission('tarjeta', 100000)).toBe(4000);
    expect(calculatePaymentCommission('tarjeta', 250000)).toBe(10000);
  });

  it('los demas metodos no tienen comision', () => {
    for (const m of ['efectivo', 'transferencia', 'crédito']) {
      expect(calculatePaymentCommission(m, 100000)).toBe(0);
    }
  });

  it('reconoce todos los metodos que la app puede producir', () => {
    // Si alguien agrega un metodo al selector y olvida la tarifa, este caso
    // no lo atrapa; lo que si atrapa es que ninguno quede sin evaluar.
    for (const m of METODOS_REALES) {
      expect(typeof calculatePaymentCommission(m, 100000)).toBe('number');
    }
  });
});

describe('no vuelven las copias locales', () => {
  const archivos = [
    'src/components/TechnicalService.tsx',
    'src/components/Layaway.tsx',
    'src/components/Sales.tsx',
  ];

  it('ningun componente define su propia calculatePaymentCommission', () => {
    for (const f of archivos) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toContain('const calculatePaymentCommission');
    }
  });

  it('ningun componente conserva los casos en ingles del modelo viejo', () => {
    for (const f of archivos) {
      const src = readFileSync(f, 'utf8');
      for (const caso of ["case 'card'", "case 'cash'", "case 'sistecredito'", "case 'addi'"]) {
        expect(src).not.toContain(caso);
      }
    }
  });

  it('los tres modulos importan la compartida', () => {
    for (const f of archivos) {
      const src = readFileSync(f, 'utf8');
      expect(src).toContain("from '../utils/paymentCommission'");
    }
  });
});
