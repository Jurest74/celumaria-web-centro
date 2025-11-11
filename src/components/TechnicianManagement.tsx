import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, User, Save, X } from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../services/firebase/collections';
import { Technician } from '../types';
import { useAuth } from '../contexts/AuthContext';

export function TechnicianManagement() {
  const { user } = useAuth();
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null);
  const [formData, setFormData] = useState({
    name: ''
  });
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.TECHNICIANS), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const techniciansData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Technician[];
      setTechnicians(techniciansData);
    });

    return () => unsubscribe();
  }, []);

  const resetForm = () => {
    setFormData({
      name: ''
    });
    setEditingTechnician(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setLoading(true);
    try {
      const now = new Date().toISOString();
      
      if (editingTechnician) {
        // Actualizar técnico existente
        await updateDoc(doc(db, COLLECTIONS.TECHNICIANS, editingTechnician.id), {
          name: formData.name.trim(),
          updatedAt: now
        });
      } else {
        // Crear nuevo técnico
        await addDoc(collection(db, COLLECTIONS.TECHNICIANS), {
          name: formData.name.trim(),
          isActive: true,
          createdAt: now,
          updatedAt: now,
          createdBy: user?.uid || null
        });
      }

      resetForm();
    } catch (error) {
      console.error('Error saving technician:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (technician: Technician) => {
    setEditingTechnician(technician);
    setFormData({
      name: technician.name
    });
    setShowForm(true);
  };


  const handleDelete = async (technicianId: string) => {
    if (deleteConfirm !== technicianId) {
      setDeleteConfirm(technicianId);
      return;
    }

    try {
      await deleteDoc(doc(db, COLLECTIONS.TECHNICIANS, technicianId));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting technician:', error);
    }
  };



  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg">
        {/* Header */}
        <div className="border-b border-gray-200 p-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Gestión de Técnicos</h1>
              <p className="text-gray-600 mt-1">Administra el equipo técnico de la empresa</p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-5 w-5 mr-2" />
              Nuevo Técnico
            </button>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full max-h-90vh overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">
                    {editingTechnician ? 'Editar Técnico' : 'Nuevo Técnico'}
                  </h2>
                  <button
                    onClick={resetForm}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                      placeholder="Nombre del técnico"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {loading ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-1 gap-6 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center">
                <User className="h-8 w-8 text-blue-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-blue-900">Total de Técnicos</p>
                  <p className="text-2xl font-bold text-blue-600">{technicians.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Technicians List */}
          {technicians.length === 0 ? (
            <div className="text-center py-12">
              <User className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay técnicos registrados</h3>
              <p className="text-gray-600 mb-4">Comienza agregando tu primer técnico</p>
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-5 w-5 mr-2" />
                Agregar Técnico
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {technicians.map((technician) => (
                <div key={technician.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{technician.name}</h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleEdit(technician)}
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Editar técnico"
                      >
                        <Edit className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => handleDelete(technician.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          deleteConfirm === technician.id
                            ? 'bg-red-100 text-red-700'
                            : 'text-red-600 hover:bg-red-100'
                        }`}
                        title={deleteConfirm === technician.id ? 'Confirmar eliminación' : 'Eliminar técnico'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {deleteConfirm && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">
                Haz clic nuevamente en el botón de eliminar para confirmar la eliminación del técnico.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}