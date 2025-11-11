import { useState, useMemo } from 'react';
import { X, Search, Gift, Plus } from 'lucide-react';
import { useAppSelector } from '../hooks/useAppSelector';
import { selectProducts } from '../store/selectors';
import { formatCurrency } from '../utils/currency';

interface CourtesyModalProps {
  onClose: () => void;
  onAdd: (courtesyItem: any) => void;
}

export function CourtesyModal({ onClose, onAdd }: CourtesyModalProps) {
  const products = useAppSelector(selectProducts);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [reason, setReason] = useState('');

  // Filtrar productos por búsqueda
  const filteredProducts = useMemo(() => {
    if (!searchQuery || searchQuery.trim().length < 4) return [];

    const query = searchQuery.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.referencia?.toLowerCase().includes(query) ||
      p.category?.toLowerCase().includes(query) ||
      p.imei?.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  const handleSelectProduct = (product: any) => {
    setSelectedProduct(product);
    setSearchQuery('');
  };

  const handleAddCourtesy = () => {
    const qty = typeof quantity === 'number' ? quantity : parseInt(quantity || '0');
    if (!selectedProduct || qty < 1) return;

    // Validar stock disponible
    if (selectedProduct.stock < qty) {
      alert(`Stock insuficiente. Solo hay ${selectedProduct.stock} unidades disponibles.`);
      return;
    }

    const courtesyItem: any = {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      quantity: qty,
      normalPrice: selectedProduct.salePrice,
      purchasePrice: selectedProduct.purchasePrice,
      totalValue: selectedProduct.salePrice * qty,
      totalCost: selectedProduct.purchasePrice * qty,
    };

    // Solo agregar campos opcionales si tienen valor
    if (selectedProduct.category) courtesyItem.category = selectedProduct.category;
    if (selectedProduct.referencia) courtesyItem.referencia = selectedProduct.referencia;
    if (selectedProduct.imei) courtesyItem.imei = selectedProduct.imei;
    if (reason.trim()) courtesyItem.reason = reason.trim();

    onAdd(courtesyItem);
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[99] bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-cyan-100 rounded-lg">
                <Gift className="h-6 w-6 text-cyan-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Añadir Cortesía</h2>
                <p className="text-sm text-gray-600">Selecciona un producto para regalar al cliente</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {!selectedProduct ? (
              <>
                {/* Buscador de productos */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar producto por nombre, referencia, IMEI..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    autoFocus
                  />
                </div>

                {/* Lista de productos */}
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {searchQuery.trim().length < 4 ? (
                    <div className="text-center py-8 text-gray-500">
                      Escribe al menos 4 caracteres para buscar productos
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No se encontraron productos
                    </div>
                  ) : (
                    filteredProducts.map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleSelectProduct(product)}
                        className="w-full p-4 border border-gray-200 rounded-lg hover:border-cyan-500 hover:bg-cyan-50 transition-all text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">{product.name}</h3>
                            <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                              {product.referencia && (
                                <span>Ref: {product.referencia}</span>
                              )}
                              {product.imei && (
                                <span>IMEI: {product.imei}</span>
                              )}
                              <span className={product.stock > 0 ? 'text-green-600' : 'text-red-600'}>
                                Stock: {product.stock}
                              </span>
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-lg font-bold text-cyan-600">
                              {formatCurrency(product.salePrice)}
                            </div>
                            <div className="text-xs text-gray-500">
                              Costo: {formatCurrency(product.purchasePrice)}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Producto seleccionado */}
                <div className="p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{selectedProduct.name}</h3>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                        {selectedProduct.referencia && (
                          <span>Ref: {selectedProduct.referencia}</span>
                        )}
                        {selectedProduct.imei && (
                          <span>IMEI: {selectedProduct.imei}</span>
                        )}
                        <span>Stock: {selectedProduct.stock}</span>
                      </div>
                      <div className="mt-2 flex items-center space-x-4">
                        <div>
                          <span className="text-sm text-gray-600">Valor: </span>
                          <span className="font-bold text-cyan-600">
                            {formatCurrency(selectedProduct.salePrice)}
                          </span>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Costo: </span>
                          <span className="font-semibold text-gray-700">
                            {formatCurrency(selectedProduct.purchasePrice)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedProduct(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Cantidad */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cantidad
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedProduct.stock}
                    value={quantity}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        setQuantity('');
                      } else {
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 1) {
                          setQuantity(numValue);
                        }
                      }
                    }}
                    onBlur={() => {
                      if (quantity === '' || quantity < 1) {
                        setQuantity(1);
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>

                {/* Motivo (opcional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Motivo (opcional)
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Ej: Cliente frecuente, promoción, etc."
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                  />
                </div>

                {/* Resumen */}
                <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Valor total regalado:</span>
                    <span className="font-bold text-cyan-600">
                      {formatCurrency(selectedProduct.salePrice * (typeof quantity === 'number' ? quantity : 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Costo real:</span>
                    <span className="font-semibold text-red-600">
                      -{formatCurrency(selectedProduct.purchasePrice * (typeof quantity === 'number' ? quantity : 0))}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            {selectedProduct && (
              <button
                onClick={handleAddCourtesy}
                disabled={quantity === '' || (typeof quantity === 'number' && (quantity < 1 || quantity > selectedProduct.stock))}
                className="flex items-center space-x-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" />
                <span>Añadir Cortesía</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
