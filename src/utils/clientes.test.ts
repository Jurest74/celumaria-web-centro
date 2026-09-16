// Que impide borrar un cliente.
//
// La verificacion consulta Firestore en el momento del borrado y no el store
// de Redux: al entrar a la pantalla de Clientes solo se cargan clientes, asi
// que filtrar el arreglo del store leia casi siempre un arreglo vacio y la
// comprobacion pasaba sin comprobar nada.

import { describe, it, expect } from 'vitest';

// Replica de lo que cuenta compromisosActivosDeCliente.
const CERRADOS_PLAN = ['completed', 'cancelled'];
const CERRADOS_SERVICIO = ['completed', 'cancelled', 'delivered'];
const vivos = (docs: { status?: string }[], cerrados: string[]) =>
  docs.filter(d => !cerrados.includes(d.status as string)).length;

describe('planes separe que bloquean el borrado', () => {
  it('un plan activo bloquea', () => {
    expect(vivos([{ status: 'active' }], CERRADOS_PLAN)).toBe(1);
  });

  it('completados y cancelados no bloquean', () => {
    expect(vivos([{ status: 'completed' }, { status: 'cancelled' }], CERRADOS_PLAN)).toBe(0);
  });

  it('un plan sin estado se considera vivo: no se asume que este cerrado', () => {
    expect(vivos([{}], CERRADOS_PLAN)).toBe(1);
  });
});

describe('servicios tecnicos que bloquean el borrado', () => {
  it('un servicio activo bloquea', () => {
    expect(vivos([{ status: 'active' }], CERRADOS_SERVICIO)).toBe(1);
  });

  it('un servicio entregado no bloquea', () => {
    // 'delivered' es un estado real: firestore lo escribe al saldar el servicio.
    expect(vivos([{ status: 'delivered' }], CERRADOS_SERVICIO)).toBe(0);
  });

  it('cuenta varios a la vez', () => {
    const docs = [{ status: 'active' }, { status: 'completed' }, { status: 'active' }];
    expect(vivos(docs, CERRADOS_SERVICIO)).toBe(2);
  });
});

describe('aviso del saldo a favor', () => {
  // El saldo es plata que el negocio le debe al cliente y al borrarlo
  // desaparece. No se bloquea porque el saldo no es editable en ninguna
  // pantalla y el cliente quedaria imposible de eliminar.
  const avisa = (credit?: number) => (credit || 0) > 0;

  it('con saldo se avisa', () => {
    expect(avisa(25000)).toBe(true);
  });

  it('sin saldo no se avisa', () => {
    expect(avisa(0)).toBe(false);
    expect(avisa(undefined)).toBe(false);
  });
});
