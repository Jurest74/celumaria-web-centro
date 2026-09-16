import { describe, it, expect, vi } from 'vitest';
import { ScreenErrorBoundary } from './ScreenErrorBoundary';

// Render minimo sin jsdom: se instancia la clase y se ejercita su logica,
// que es donde vive la decision (que mensaje mostrar y cuando).
describe('ScreenErrorBoundary', () => {
  const instancia = () => new (ScreenErrorBoundary as any)({ children: null });

  it('sin error, muestra el contenido', () => {
    const b = instancia();
    b.state = { error: null };
    b.props = { children: 'contenido' };
    expect(b.render()).toBe('contenido');
  });

  it('reconoce el fallo de cargar el archivo de una pantalla', () => {
    const b = instancia();
    const errores = [
      new Error('Failed to fetch dynamically imported module: /assets/Reports-abc.js'),
      new Error('error loading dynamically imported module'),
      new TypeError('Failed to fetch'),
      new Error('Importing a module script failed.'),
    ];
    for (const e of errores) {
      expect(b.esFalloDeCarga(e)).toBe(true);
    }
  });

  it('un error cualquiera de la pantalla no se confunde con el de carga', () => {
    const b = instancia();
    expect(b.esFalloDeCarga(new Error('customer.credit is not a function'))).toBe(false);
  });

  it('getDerivedStateFromError guarda el error para dejar de renderizar la pantalla rota', () => {
    const e = new Error('lo que sea');
    expect((ScreenErrorBoundary as any).getDerivedStateFromError(e)).toEqual({ error: e });
  });

  it('el fallo se registra en consola para poder diagnosticarlo', () => {
    const b = instancia();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    b.componentDidCatch(new Error('x'));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
