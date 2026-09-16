import { describe, it, expect } from 'vitest';
import { agruparPedidos, faltantesDeStock, StockInsuficienteError } from './stock';

const existencias = (o: Record<string, number | null>) => new Map(Object.entries(o));

describe('agrupar lo pedido por producto', () => {
  it('suma varias lineas del mismo producto', () => {
    const r = agruparPedidos([
      { productId: 'p1', quantity: 2, productName: 'Cable' },
      { productId: 'p1', quantity: 3 },
      { productId: 'p2', quantity: 1, productName: 'Forro' },
    ]);
    expect(r.get('p1')!.total).toBe(5);
    expect(r.get('p1')!.nombre).toBe('Cable');
    expect(r.get('p2')!.total).toBe(1);
  });

  it('ignora lineas sin producto o sin cantidad', () => {
    const r = agruparPedidos([
      { productId: '', quantity: 5 },
      { productId: 'p1', quantity: 0 },
      { productId: 'p2', quantity: 2 },
    ]);
    expect(r.size).toBe(1);
    expect(r.get('p2')!.total).toBe(2);
  });
});

describe('deteccion de faltantes', () => {
  it('pasa cuando alcanza justo', () => {
    const pedidos = agruparPedidos([{ productId: 'p1', quantity: 3, productName: 'Cable' }]);
    expect(faltantesDeStock(pedidos, existencias({ p1: 3 }))).toEqual([]);
  });

  it('detecta cuando falta una unidad', () => {
    const pedidos = agruparPedidos([{ productId: 'p1', quantity: 3, productName: 'Cable' }]);
    const f = faltantesDeStock(pedidos, existencias({ p1: 2 }));
    expect(f).toEqual([{ productId: 'p1', nombre: 'Cable', pedido: 3, disponible: 2 }]);
  });

  it('el mismo producto en dos lineas se verifica por el total, no por linea', () => {
    // Cada linea cabria sola en el stock de 3; juntas no. Verificar por linea
    // dejaria pasar la venta y el stock quedaria en -1.
    const pedidos = agruparPedidos([
      { productId: 'p1', quantity: 2, productName: 'Cable' },
      { productId: 'p1', quantity: 2 },
    ]);
    const f = faltantesDeStock(pedidos, existencias({ p1: 3 }));
    expect(f).toEqual([{ productId: 'p1', nombre: 'Cable', pedido: 4, disponible: 3 }]);
  });

  it('un producto que ya no existe se reporta con disponible 0', () => {
    const pedidos = agruparPedidos([{ productId: 'borrado', quantity: 1, productName: 'Viejo' }]);
    const f = faltantesDeStock(pedidos, existencias({}));
    expect(f).toEqual([{ productId: 'borrado', nombre: 'Viejo', pedido: 1, disponible: 0 }]);
  });

  it('un stock ya negativo no deja pasar nada', () => {
    const pedidos = agruparPedidos([{ productId: 'p1', quantity: 1, productName: 'Cable' }]);
    const f = faltantesDeStock(pedidos, existencias({ p1: -2 }));
    expect(f[0].disponible).toBe(-2);
  });

  it('reporta todos los faltantes, no solo el primero', () => {
    const pedidos = agruparPedidos([
      { productId: 'p1', quantity: 5, productName: 'Cable' },
      { productId: 'p2', quantity: 5, productName: 'Forro' },
      { productId: 'p3', quantity: 1, productName: 'Vidrio' },
    ]);
    const f = faltantesDeStock(pedidos, existencias({ p1: 1, p2: 0, p3: 9 }));
    expect(f.map(x => x.productId)).toEqual(['p1', 'p2']);
  });
});

describe('el error dice que falto', () => {
  it('nombra producto, pedido y disponible', () => {
    const e = new StockInsuficienteError([
      { productId: 'p1', nombre: 'Cable USB', pedido: 3, disponible: 1 },
    ]);
    expect(e.message).toContain('Cable USB');
    expect(e.message).toContain('se piden 3');
    expect(e.message).toContain('hay 1');
    expect(e.name).toBe('StockInsuficienteError');
    expect(e.faltantes).toHaveLength(1);
  });
});
