// Reserva de existencias.
//
// Los descuentos de stock se hacian con increment(-cantidad) dentro de un
// writeBatch. increment no tiene piso y un batch no relee lo que toca, asi
// que dos cajas vendiendo la ultima unidad pasaban ambas la validacion del
// cliente y ambas escribian: el stock quedaba en negativo. La verificacion
// tiene que ocurrir contra el dato fresco y dentro de la misma transaccion
// que lo escribe; aqui vive esa cuenta, aparte de Firestore para poder
// probarla.

export interface Faltante {
  productId: string;
  nombre: string;
  pedido: number;
  disponible: number;
}

export class StockInsuficienteError extends Error {
  readonly faltantes: Faltante[];

  constructor(faltantes: Faltante[]) {
    super(
      'Stock insuficiente: ' +
        faltantes
          .map(f => `${f.nombre} (se piden ${f.pedido}, hay ${f.disponible})`)
          .join('; ')
    );
    this.name = 'StockInsuficienteError';
    this.faltantes = faltantes;
  }
}

export interface Pedido {
  productId: string;
  quantity: number;
  productName?: string;
}

/**
 * Suma las cantidades pedidas por producto. Una misma venta puede traer el
 * mismo producto en varias lineas —y ademas como cortesia—, y verificar cada
 * linea por separado dejaria pasar un total que no alcanza.
 */
export const agruparPedidos = (pedidos: Pedido[]): Map<string, { total: number; nombre: string }> => {
  const porProducto = new Map<string, { total: number; nombre: string }>();
  for (const p of pedidos) {
    if (!p.productId || !p.quantity) continue;
    const previo = porProducto.get(p.productId);
    porProducto.set(p.productId, {
      total: (previo?.total || 0) + p.quantity,
      nombre: previo?.nombre || p.productName || p.productId,
    });
  }
  return porProducto;
};

/**
 * Compara lo pedido contra las existencias leidas y devuelve lo que no
 * alcanza. Un producto que ya no existe se reporta con disponible 0.
 */
export const faltantesDeStock = (
  pedidos: Map<string, { total: number; nombre: string }>,
  existencias: Map<string, number | null>
): Faltante[] => {
  const faltantes: Faltante[] = [];
  for (const [productId, { total, nombre }] of pedidos) {
    const disponible = existencias.get(productId);
    if (disponible === undefined || disponible === null) {
      faltantes.push({ productId, nombre, pedido: total, disponible: 0 });
      continue;
    }
    if (disponible < total) {
      faltantes.push({ productId, nombre, pedido: total, disponible });
    }
  }
  return faltantes;
};
