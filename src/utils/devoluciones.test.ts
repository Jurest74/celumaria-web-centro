// Reglas al eliminar un abono de plan separe desde el historial de ventas.
//
// El abono se guarda como una venta, pero esa venta no registra el id del pago
// dentro del plan: hay que encontrarlo por monto. Cuando el plan tiene dos
// pagos del mismo valor no hay forma de saber cual corresponde, y descontar el
// equivocado descuadra el plan sin dejar rastro. Estas pruebas fijan que en ese
// caso no se borre nada.

import { describe, it, expect } from 'vitest';

// Replica de la seleccion que hace confirmDelete.
const elegirPago = (pagos: { id: string; amount: number }[], montoVenta: number) => {
  const candidatos = pagos.filter(p => p.amount === montoVenta);
  if (candidatos.length === 0) return { estado: 'sin-coincidencia' as const };
  if (candidatos.length > 1) return { estado: 'ambiguo' as const, cuantos: candidatos.length };
  return { estado: 'unico' as const, pago: candidatos[0] };
};

// Replica del recalculo del plan tras quitar el pago.
const recalcularPlan = (plan: any, pagoId: string) => {
  const pagos = plan.payments.filter((p: any) => p.id !== pagoId);
  const totalPagado = pagos.reduce((s: number, p: any) => s + p.amount, 0);
  const saldo = plan.totalAmount - totalPagado;
  const estado = plan.status === 'completed' && saldo > 0 ? 'active' : plan.status;
  return { pagos, saldo, estado };
};

describe('elegir que pago quitar del plan', () => {
  it('con un solo pago de ese monto, lo identifica', () => {
    const r = elegirPago([{ id: 'a', amount: 50000 }, { id: 'b', amount: 30000 }], 50000);
    expect(r.estado).toBe('unico');
    expect((r as any).pago.id).toBe('a');
  });

  it('con dos pagos del mismo monto NO elige: seria descontar al azar', () => {
    const r = elegirPago([{ id: 'a', amount: 50000 }, { id: 'b', amount: 50000 }], 50000);
    expect(r.estado).toBe('ambiguo');
    expect((r as any).cuantos).toBe(2);
  });

  it('si ningun pago coincide, tampoco borra', () => {
    const r = elegirPago([{ id: 'a', amount: 50000 }], 99000);
    expect(r.estado).toBe('sin-coincidencia');
  });
});

describe('el plan queda cuadrado tras quitar el pago', () => {
  const plan = {
    totalAmount: 100000,
    status: 'completed',
    payments: [{ id: 'a', amount: 60000 }, { id: 'b', amount: 40000 }]
  };

  it('el saldo vuelve a reflejar lo realmente pagado', () => {
    const r = recalcularPlan(plan, 'b');
    expect(r.pagos).toHaveLength(1);
    expect(r.saldo).toBe(40000);
  });

  it('un plan completado vuelve a activo si queda saldo', () => {
    expect(recalcularPlan(plan, 'b').estado).toBe('active');
  });

  it('si sigue sin saldo, el plan no cambia de estado', () => {
    const pagado = { ...plan, totalAmount: 60000 };
    const r = recalcularPlan(pagado, 'b');
    expect(r.saldo).toBe(0);
    expect(r.estado).toBe('completed');
  });
});

describe('abono al saldo del cliente en una devolucion', () => {
  // El saldo se suma con increment en el mismo batch de la devolucion. Antes
  // se leia de Redux y se escribia el total, lo que pisaba cambios hechos
  // entremedio. Esto fija la cuenta del reintegro.
  const reintegro = (precio: number, cantidad: number) => precio * cantidad;

  it('el reintegro es precio por cantidad devuelta', () => {
    expect(reintegro(35000, 2)).toBe(70000);
  });

  it('devolver cero no genera abono', () => {
    expect(reintegro(35000, 0)).toBe(0);
  });
});
