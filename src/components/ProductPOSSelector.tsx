import React, { useState, useRef, useEffect } from 'react';
import { Plus, Minus, Scan, X } from 'lucide-react';
import { formatCurrency, formatNumber } from '../utils/currency';

interface Product {
  id: string;
  name: string;
  salePrice: number;
  purchasePrice: number;
  stock: number;
  referencia?: string;
  barcode?: string;
}

interface TempItem {
  productId: string;
  productName: string;
  quantity: number;
  salePrice: number;
  purchasePrice: number;
}

interface Props {
  products: Product[];
  isLoading: boolean;
  onChange: (items: TempItem[]) => void;
}

export const ProductPOSSelector: React.FC<Props> = ({ products, isLoading, onChange }) => {
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [tempItems, setTempItems] = useState<TempItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchMode, setSearchMode] = useState<'dropdown' | 'barcode'>('dropdown');
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onChange(tempItems);
  }, [tempItems, onChange]);

  useEffect(() => {
    if (searchMode === 'barcode' && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [searchMode]);

  const handleBarcodeSearch = (barcode: string) => {
    const product = products.find(p => p.barcode === barcode && p.stock > 0);
    if (product) {
      setSelectedProduct(product.id);
      setBarcodeInput('');
      setProductSearch('');
      addProductToList(product.id, 1);
    } else {
      setBarcodeInput('');
      setProductSearch('');
      // Aquí podrías mostrar un error si lo deseas
    }
  };

  const handleBarcodeKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      handleBarcodeSearch(barcodeInput.trim());
    }
  };

  const addProductToList = (productId: string, qty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product || qty <= 0 || qty > product.stock) return;
    const existing = tempItems.find(item => item.productId === product.id);
    if (existing) {
      const newQty = existing.quantity + qty;
      if (newQty > product.stock) return;
      setTempItems(items => items.map(item =>
        item.productId === product.id
          ? { ...item, quantity: newQty }
          : item
      ));
    } else {
      setTempItems(items => [
        ...items,
        {
          productId: product.id,
          productName: product.name,
          quantity: qty,
          salePrice: product.salePrice,
          purchasePrice: product.purchasePrice,
        },
      ]);
    }
  };

  const handleAdd = () => {
    if (!selectedProduct) return;
    addProductToList(selectedProduct, quantity);
    setSelectedProduct('');
    setProductSearch('');
    setBarcodeInput('');
    setQuantity(1);
  };

  const handleRemove = (productId: string) => {
    setTempItems(items => items.filter(item => item.productId !== productId));
  };

  const handleUpdateQty = (productId: string, newQty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product || newQty < 1 || newQty > product.stock) return;
    setTempItems(items => items.map(item =>
      item.productId === productId ? { ...item, quantity: newQty } : item
    ));
  };

  const subtotal = tempItems.reduce((sum, item) => sum + item.salePrice * item.quantity, 0);

  return (
    <div>
      {/* Toggle search mode */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-2">
        <button
          onClick={() => setSearchMode('dropdown')}
          disabled={isLoading}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
            searchMode === 'dropdown'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Lista de Productos
        </button>
        <button
          onClick={() => setSearchMode('barcode')}
          disabled={isLoading}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center disabled:opacity-50 ${
            searchMode === 'barcode'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Scan className="h-4 w-4 mr-1" /> Código de Barras
        </button>
      </div>

      {/* Product Selection */}
      {searchMode === 'dropdown' ? (
        <div className="relative w-full mb-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                ref={productInputRef}
                type="text"
                placeholder="Buscar producto..."
                value={productSearch}
                onChange={e => {
                  setProductSearch(e.target.value);
                  setShowProductDropdown(true);
                }}
                onFocus={() => setShowProductDropdown(true)}
                onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
                disabled={isLoading}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full disabled:opacity-50"
              />
              {showProductDropdown && productSearch && (
                <div className="absolute z-20 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto mt-1">
                  {products.filter(p => p.stock > 0 && (
                    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                    (p.referencia && p.referencia.toLowerCase().includes(productSearch.toLowerCase()))
                  )).length === 0 ? (
                    <div className="p-3 text-gray-500 text-sm">No hay productos</div>
                  ) : (
                    products
                      .filter(p => p.stock > 0 && (
                        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                        (p.referencia && p.referencia.toLowerCase().includes(productSearch.toLowerCase()))
                      ))
                      .map(product => (
                        <button
                          key={product.id}
                          type="button"
                          onMouseDown={() => {
                            setSelectedProduct(product.id);
                            setProductSearch(product.name);
                            setShowProductDropdown(false);
                            setTimeout(() => productInputRef.current?.blur(), 0);
                          }}
                          className={`w-full text-left px-4 py-2 hover:bg-blue-50 ${selectedProduct === product.id ? 'bg-blue-100' : ''}`}
                        >
                          <div className="font-medium">{product.name}</div>
                          <div className="text-sm text-gray-500">
                            {product.referencia && <span className="mr-2">Ref: {product.referencia}</span>}
                            {formatCurrency(product.salePrice)} • Stock: {formatNumber(product.stock)}
                          </div>
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>
            <input
              type="number"
              min={1}
              max={selectedProduct ? (products.find(p => p.id === selectedProduct)?.stock || 1) : 1}
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              disabled={isLoading}
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
            <button
              onClick={handleAdd}
              disabled={!selectedProduct || isLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 mb-2">
          <div className="flex items-center space-x-2">
            <Scan className="h-5 w-5 text-gray-400" />
            <input
              ref={barcodeInputRef}
              type="text"
              placeholder="Escanea o ingresa código de barras..."
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              onKeyPress={handleBarcodeKeyPress}
              disabled={isLoading}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
            <button
              onClick={() => handleBarcodeSearch(barcodeInput.trim())}
              disabled={!barcodeInput.trim() || isLoading}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Agregar
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Presiona Enter o haz clic en Agregar después de escanear/ingresar el código de barras
          </p>
        </div>
      )}

      {/* Current Items */}
      <div className="border border-gray-200 rounded-lg p-4 max-h-60 overflow-y-auto mb-4">
        {tempItems.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No hay productos agregados</p>
        ) : (
          <div className="space-y-2">
            {tempItems.map(item => (
              <div key={item.productId} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{item.productName}</div>
                  <div className="text-sm text-gray-500">
                    {(() => {
                      const product = products.find(p => p.id === item.productId);
                      return product?.referencia ? `Ref: ${product.referencia} • ` : '';
                    })()}
                    {formatCurrency(item.salePrice)} cada uno
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleUpdateQty(item.productId, item.quantity - 1)}
                    disabled={isLoading || item.quantity <= 1}
                    className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-sm disabled:opacity-50"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                  <button
                    onClick={() => handleUpdateQty(item.productId, item.quantity + 1)}
                    disabled={isLoading || item.quantity >= (products.find(p => p.id === item.productId)?.stock || 1)}
                    className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-sm disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <span className="font-medium w-20 text-right">{formatCurrency(item.salePrice * item.quantity)}</span>
                  <button
                    onClick={() => handleRemove(item.productId)}
                    disabled={isLoading}
                    className="text-red-600 hover:text-red-800 w-6 h-6 flex items-center justify-center disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {tempItems.length > 0 && (
        <div className="border-t pt-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span>Subtotal:</span>
            <span className="font-bold text-blue-600">{formatCurrency(subtotal)}</span>
          </div>
        </div>
      )}
    </div>
  );
};
