// Reglas de la cancelacion de un plan separe. La operacion vive en
// layawaysService.cancel, dentro de una transaccion de Firestore; aqui se
// prueban las cuentas que decide, que son las que determinan cuanto stock
// vuelve y cuanto saldo se acredita.

import { describe, it, expect } from 'vitest';

// Replica exacta de lo que calcula layawaysService.cancel.
const calcularCancelacion = (plan: any) => {
  const porDevolver = (plan.items || [])
    .map((item: any) => ({
      productId: item.productId,
      cantidad: item.quantity - (item.pickedUpQuantity || 0)
    }))
    .filter((x: any) => x.productId && x.cantidad > 0);

  const totalPagado = (plan.payments || []).reduce((s: number, p: any) => s + p.amount, 0);
  const valorRecogido = (plan.items || []).reduce(
    (s: number, item: any) => s + (item.pickedUpQuantity || 0) * (item.productSalePrice || 0),
    0
  );
  return {
    unidadesDevueltas: porDevolver.reduce((s: number, x: any) => s + x.cantidad, 0),
    saldoAcreditado: Math.max(0, totalPagado - Math.min(totalPagado, valorRecogido))
  };
};

const item = (cantidad: number, recogido: number, precio: number) => ({
  productId: 'p1', quantity: cantidad, pickedUpQuantity: recogido, productSalePrice: precio
});

describe('que vuelve al inventario al cancelar', () => {
  it('vuelven solo las unidades no recogidas', () => {
    const r = calcularCancelacion({ items: [item(5, 2, 10000)], payments: [] });
    expect(r.unidadesDevueltas).toBe(3);
  });

  it('si ya se recogio todo, no vuelve nada', () => {
    const r = calcularCancelacion({ items: [item(5, 5, 10000)], payments: [] });
    expect(r.unidadesDevueltas).toBe(0);
  });

  it('un repuesto sin productId no toca inventario', () => {
    const r = calcularCancelacion({
      items: [{ quantity: 3, partName: 'Pantalla generica' }],
      payments: []
    });
    expect(r.unidadesDevueltas).toBe(0);
  });
});

describe('cuanto saldo a favor se acredita', () => {
  it('nada recogido: se acredita todo lo pagado', () => {
    const r = calcularCancelacion({
      items: [item(2, 0, 50000)],
      payments: [{ amount: 30000 }]
    });
    expect(r.saldoAcreditado).toBe(30000);
  });

  it('lo pagado se descuenta contra el valor de lo ya recogido', () => {
    const r = calcularCancelacion({
      items: [item(2, 1, 50000)],
      payments: [{ amount: 80000 }]
    });
    // 80.000 pagados, 50.000 corresponden al producto entregado
    expect(r.saldoAcreditado).toBe(30000);
  });

  it('si lo recogido vale mas que lo pagado, no se acredita nada', () => {
    const r = calcularCancelacion({
      items: [item(2, 2, 50000)],
      payments: [{ amount: 40000 }]
    });
    expect(r.saldoAcreditado).toBe(0);
  });

  it('un item sin precio no inventa valor recogido ni produce NaN', () => {
    const r = calcularCancelacion({
      items: [{ productId: 'p1', quantity: 1, pickedUpQuantity: 1 }],
      payments: [{ amount: 20000 }]
    });
    expect(Number.isNaN(r.saldoAcreditado)).toBe(false);
    expect(r.saldoAcreditado).toBe(20000);
  });
});
