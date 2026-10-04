import { describe, expect, it } from 'vitest';
import { saldoAFavorDelPago, saldoDelServicio, totalDelServicio } from './servicioTecnico';

describe('cuentas del servicio técnico', () => {
  it('con precio total, el total es el precio actual aunque cambien los repuestos', () => {
    expect(totalDelServicio({ serviceCost: 200000, items: [{ totalCost: 40000 }] })).toBe(200000);
  });

  it('el saldo sale del precio actual y de los pagos, no de campos guardados', () => {
    const servicio = { serviceCost: 200000, payments: [{ amount: 50000 }, { amount: 50000 }], remainingBalance: 50000 };
    expect(saldoDelServicio(servicio)).toBe(100000);
  });

  it('servicios anteriores al precio total: repuestos más mano de obra', () => {
    expect(totalDelServicio({ laborCost: 60000, items: [{ totalCost: 40000 }] })).toBe(100000);
  });

  it('la parte de un pago hecha con saldo a favor', () => {
    expect(saldoAFavorDelPago({ paymentMethods: [{ method: 'credit', amount: 50000 }, { method: 'efectivo', amount: 50000 }] })).toBe(50000);
    expect(saldoAFavorDelPago({ paymentMethods: [{ method: 'efectivo', amount: 50000 }] })).toBe(0);
    expect(saldoAFavorDelPago({})).toBe(0);
  });
});
