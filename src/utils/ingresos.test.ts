// El ingreso de una venta se mide igual en todo el sistema: finalTotal si
// existe, si no total. finalTotal incluye el recargo que el cliente paga por
// usar tarjeta, asi que medir con `total` reporta de menos justo ese recargo.
//
// Reports.tsx era el unico que usaba `sale.total` pelado, y por eso mostraba
// cifras distintas a las del panel para el mismo periodo.

import { describe, it, expect } from 'vitest';

const ingreso = (sale: any) => sale.finalTotal ?? sale.total ?? 0;

describe('cuanto ingreso deja una venta', () => {
  it('en efectivo, el total', () => {
    expect(ingreso({ total: 100000 })).toBe(100000);
  });

  it('con tarjeta, el total mas el recargo que pago el cliente', () => {
    expect(ingreso({ total: 100000, finalTotal: 103000 })).toBe(103000);
  });

  it('una venta sin cifras no aporta, y no da NaN', () => {
    expect(ingreso({})).toBe(0);
    expect(Number.isNaN(ingreso({}))).toBe(false);
  });

  it('un finalTotal en cero se respeta: no cae al total', () => {
    // Una entrega de plan separe se guarda con total 0 y no es ingreso nuevo.
    // Con `||` en vez de `??` el cero caia al siguiente valor y la entrega
    // habria contado dos veces.
    expect(ingreso({ total: 0, finalTotal: 0 })).toBe(0);
  });
});

describe('prorrateo de la ganancia entre metodos de pago', () => {
  // La parte de cada metodo se calcula sobre el ingreso de la venta. Si el
  // divisor fuera `total` mientras los pagos suman `finalTotal`, las partes
  // sumarian mas que la ganancia real.
  const parte = (sale: any, montoPago: number) =>
    (sale.totalProfit || 0) * (montoPago / (ingreso(sale) || 1));

  it('las partes suman exactamente la ganancia de la venta', () => {
    const sale = { total: 100000, finalTotal: 103000, totalProfit: 39000 };
    const pagos = [60000, 43000]; // suman finalTotal
    const suma = pagos.reduce((s, m) => s + parte(sale, m), 0);
    expect(Math.round(suma)).toBe(39000);
  });

  it('una venta sin ingreso no divide por cero', () => {
    expect(parte({ total: 0, totalProfit: 0 }, 0)).toBe(0);
  });
});
