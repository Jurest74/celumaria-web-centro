import React, { useState, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Tag, 
  Package, 
  Eye, 
  EyeOff,
  X,
  Palette,
  Hash,
  AlertTriangle
} from 'lucide-react';
import { useAppSelector } from '../hooks/useAppSelector';
import { useSectionRealtime } from '../hooks/useOnDemandData';
import { selectCategories } from '../store/selectors';
import { categoriesService } from '../services/firebase/firestore';
import { Category } from '../types';
import { useNotification } from '../contexts/NotificationContext';

const PREDEFINED_COLORS = [
  '#EC4899', '#3B82F6', '#F59E0B', '#8B5CF6', '#10B981',
  '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  '#14B8A6', '#F43F5E', '#8B5CF6', '#22C55E', '#E11D48'
];

const ICON_OPTIONS = [
  'Tag', 'Package', 'Shirt', 'User', 'Gem', 'Diamond', 'Footprints',
  'Crown', 'Watch', 'Glasses', 'Heart', 'Star', 'Circle', 'Square'
];

// Elimina el estado y filtro de isActive
type CategoryWithoutActive = Omit<Category, 'isActive'>;

export function Categories() {
  // ⚡ OPTIMIZADO: NO usar listeners - datos se cargan al navegar
  const categories = useAppSelector(selectCategories);
  const { showSuccess, showError, showWarning, showConfirm } = useNotification();
  const formRef = useRef<HTMLFormElement>(null);
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedColor, setSelectedColor] = useState(PREDEFINED_COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState('Tag');
  const [isLoading, setIsLoading] = useState(false);

  // Solo filtra por búsqueda
  const filteredCategories = categories.filter(category => {
    const matchesSearch = searchTerm === '' || 
      category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (category.description && category.description.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      
      const categoryData = {
        name: formData.get('name') as string,
        description: formData.get('description') as string || '',
        color: selectedColor,
        icon: selectedIcon,
      };

      // Validaciones del lado del cliente
      if (!categoryData.name.trim()) {
        setIsLoading(false);
        showError('Error de validación', 'El nombre de la categoría es requerido');
        return;
      }

      // Verificar si se está intentando cambiar el nombre de "Celulares"
      if (editingCategory && 
          editingCategory.name.toLowerCase() === 'celulares' && 
          categoryData.name.toLowerCase() !== 'celulares') {
        setIsLoading(false);
        showError('Error de validación', 'No se puede modificar el nombre de la categoría "Celulares"');
        return;
      }

      if (!categoryData.color) {
        setIsLoading(false);
        showError('Error de validación', 'Debes seleccionar un color para la categoría');
        return;
      }

      console.log('Enviando datos de categoría:', categoryData);

      if (editingCategory) {
        console.log('Actualizando categoría:', editingCategory.id);
        await categoriesService.update(editingCategory.id, categoryData);
        
        // Reset form and state BEFORE unmounting the form
        formRef.current?.reset();
        setSelectedColor(PREDEFINED_COLORS[0]);
        setSelectedIcon('Tag');
        setEditingCategory(null);
        setShowAddForm(false); // Close form after editing
        
        showSuccess(
          'Categoría actualizada', 
          `La categoría "${categoryData.name}" se actualizó correctamente`
        );
        console.log('Categoría actualizada exitosamente');
      } else {
        console.log('Creando nueva categoría');
        const newCategoryId = await categoriesService.add(categoryData);
        console.log('Nueva categoría creada con ID:', newCategoryId);
        
        // Reset form and state BEFORE unmounting the form
        formRef.current?.reset();
        setSelectedColor(PREDEFINED_COLORS[0]);
        setSelectedIcon('Tag');
        setShowAddForm(false); // Close form after creation
        
        showSuccess(
          'Categoría creada', 
          `La categoría "${categoryData.name}" se creó correctamente`
        );
      }
      
    } catch (error) {
      console.error('Error detallado al guardar categoría:', error);
      
      // Mostrar error más específico
      let errorMessage = 'Error desconocido al guardar la categoría';
      
      if (error instanceof Error) {
        if (error.message.includes('permission-denied')) {
          errorMessage = 'No tienes permisos para crear categorías. Verifica que estés logueado como administrador.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Error de conexión. Verifica tu conexión a internet.';
        } else if (error.message.includes('quota-exceeded')) {
          errorMessage = 'Se ha excedido la cuota de Firebase. Intenta más tarde.';
        } else {
          errorMessage = error.message;
        }
      }
      
      showError('Error al guardar categoría', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (category: Category) => {
    // Verificar si la categoría es "Celulares" (no borrable)
    if (category.name.toLowerCase() === 'celulares') {
      showWarning(
        'Categoría protegida',
        'La categoría "Celulares" no se puede eliminar ya que es una categoría esencial del sistema.'
      );
      return;
    }
    
    if (category.productCount > 0) {
      showWarning(
        'No se puede eliminar',
        `No se puede eliminar esta categoría porque tiene ${category.productCount} producto(s) asociado(s). Primero reasigna o elimina los productos.`
      );
      return;
    }
    
    showConfirm(
      'Confirmar eliminación',
      `¿Estás seguro de que quieres eliminar la categoría "${category.name}"? Esta acción no se puede deshacer.`,
      async () => {
        try {
          await categoriesService.delete(category.id);
          showSuccess(
            'Categoría eliminada',
            `La categoría "${category.name}" se eliminó correctamente`
          );
        } catch (error) {
          console.error('Error deleting category:', error);
          showError(
            'Error al eliminar',
            'No se pudo eliminar la categoría. Inténtalo de nuevo.'
          );
        }
      }
    );
  };

  const startEdit = (category: Category) => {
    setEditingCategory(category);
    setSelectedColor(category.color);
    setSelectedIcon(category.icon || 'Tag');
    setShowAddForm(true);
  };

  const cancelEdit = () => {
    setEditingCategory(null);
    setShowAddForm(false);
    setSelectedColor(PREDEFINED_COLORS[0]);
    setSelectedIcon('Tag');
  };

  return (
    <div className="space-y-6">
      <div className="mb-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de Categorías</h1>
            <p className="text-gray-600 mt-1">Organiza y administra las categorías de productos de tu tienda</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <Plus className="h-5 w-5" />
              <span>Nueva Categoría</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar categorías..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Add/Edit Category Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
            </h3>
            <button
              onClick={cancelEdit}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de la Categoría *
                  {editingCategory?.name?.toLowerCase() === 'celulares' && (
                    <span className="text-xs text-amber-600 ml-2">(Protegido - No modificable)</span>
                  )}
                </label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingCategory?.name || ''}
                  required
                  disabled={isLoading || (editingCategory?.name?.toLowerCase() === 'celulares')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  placeholder="Ej: Celulares"
                  title={editingCategory?.name?.toLowerCase() === 'celulares' ? 'El nombre de la categoría "Celulares" no se puede modificar' : ''}
                />
                {editingCategory?.name?.toLowerCase() === 'celulares' && (
                  <p className="text-xs text-amber-600 mt-1">
                    Esta es una categoría esencial del sistema y su nombre no puede ser modificado.
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción
                </label>
                <input
                  type="text"
                  name="description"
                  defaultValue={editingCategory?.description || ''}
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  placeholder="Descripción opcional"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Palette className="inline h-4 w-4 mr-1" />
                  Color de Identificación
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {PREDEFINED_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      disabled={isLoading}
                      onClick={() => setSelectedColor(color)}
                      className={`w-10 h-10 rounded-lg border-2 transition-all disabled:opacity-50 ${
                        selectedColor === color 
                          ? 'border-gray-800 scale-110' 
                          : 'border-gray-300 hover:border-gray-500'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex items-center space-x-2">
                  <div 
                    className="w-6 h-6 rounded border border-gray-300"
                    style={{ backgroundColor: selectedColor }}
                  />
                  <span className="text-sm text-gray-600">{selectedColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Hash className="inline h-4 w-4 mr-1" />
                  Icono (Opcional)
                </label>
                <select
                  value={selectedIcon}
                  onChange={(e) => setSelectedIcon(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                >
                  {ICON_OPTIONS.map(icon => (
                    <option key={icon} value={icon}>{icon}</option>
                  ))}
                </select>
                <div className="mt-2 text-sm text-gray-500">
                  Vista previa del icono seleccionado
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isLoading}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                <span>
                  {isLoading ? 'Guardando...' : editingCategory ? 'Actualizar Categoría' : 'Crear Categoría'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCategories.map((category) => (
          <div 
            key={category.id} 
            className="bg-white rounded-xl p-6 shadow-sm border transition-all hover:shadow-md border-gray-100"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: category.color }}
                >
                  {category.name.charAt(0).toUpperCase()}
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-semibold text-gray-900">{category.name}</h3>
                </div>
              </div>
              <div className="flex space-x-1">
                <button
                  onClick={() => startEdit(category)}
                  className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors"
                  title="Editar categoría"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(category)}
                  className={`p-1 rounded transition-colors ${
                    category.name.toLowerCase() === 'celulares' || category.productCount > 0
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-red-600 hover:text-red-900 hover:bg-red-50'
                  }`}
                  title={
                    category.name.toLowerCase() === 'celulares'
                      ? 'Categoría protegida - No se puede eliminar'
                      : category.productCount > 0
                      ? `No se puede eliminar - Tiene ${category.productCount} producto(s)`
                      : 'Eliminar categoría'
                  }
                  disabled={category.name.toLowerCase() === 'celulares' || category.productCount > 0}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Description */}
            {category.description && (
              <p className="text-sm text-gray-600 mb-4">{category.description}</p>
            )}

            {/* Product Count */}
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <Package className="h-4 w-4 text-gray-500 mr-2" />
                <span className="text-sm font-medium text-gray-700">Productos</span>
              </div>
              <span className={`text-sm font-bold ${
                category.productCount > 0 ? 'text-blue-600' : 'text-gray-400'
              }`}>
                {category.productCount}
              </span>
            </div>

            {/* Warning for categories with no products */}
            {category.productCount === 0 && (
              <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mr-2" />
                <span className="text-xs text-yellow-700">Sin productos asignados</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredCategories.length === 0 && (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
          <div className="text-gray-400 mb-4">
            <Tag className="h-12 w-12 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron categorías</h3>
          <p className="text-gray-500">
            {searchTerm
              ? 'Intenta ajustar tus criterios de búsqueda.'
              : 'Comienza creando tu primera categoría de productos.'
            }
          </p>
        </div>
      )}
    </div>
  );
}