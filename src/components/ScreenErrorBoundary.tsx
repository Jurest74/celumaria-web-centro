import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Atrapa los fallos al cargar una pantalla.
 *
 * Con las pantallas partidas en archivos aparte, el navegador los pide cuando
 * entras a cada una. El caso que importa es el despliegue: quien tenga la
 * aplicación abierta sigue pidiendo los archivos de la versión anterior, que
 * ya no existen, y sin esto React lanza el error y la pantalla queda en
 * blanco. Recargar trae la versión nueva.
 */
export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Error mostrando la pantalla:', error);
  }

  private esFalloDeCarga(error: Error): boolean {
    const texto = `${error.name} ${error.message}`.toLowerCase();
    return (
      texto.includes('dynamically imported module') ||
      texto.includes('failed to fetch') ||
      texto.includes('importing a module script failed') ||
      texto.includes('chunkloaderror')
    );
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const deCarga = this.esFalloDeCarga(error);

    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          {deCarga ? 'Hay una versión nueva disponible' : 'No se pudo mostrar esta sección'}
        </h2>
        <p className="text-sm text-gray-600 mb-6 max-w-md">
          {deCarga
            ? 'La aplicación se actualizó mientras la tenías abierta. Recarga para continuar; no se pierde nada de lo que ya guardaste.'
            : 'Ocurrió un error al abrir esta sección. Recarga la página e inténtalo de nuevo.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Recargar
        </button>
      </div>
    );
  }
}
