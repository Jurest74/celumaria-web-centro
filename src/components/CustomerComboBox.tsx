import React, { useState, useRef, useEffect } from 'react';
import { User } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface Props {
  customers: Customer[];
  isLoading: boolean;
  onChange: (customer: Customer | null) => void;
}

export const CustomerComboBox: React.FC<Props> = ({ customers, isLoading, onChange }) => {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onChange(selectedCustomer);
  }, [selectedCustomer, onChange]);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone && c.phone.includes(search)) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        placeholder="Buscar cliente por nombre, teléfono o email..."
        value={selectedCustomer ? selectedCustomer.name + (selectedCustomer.phone ? ` - ${selectedCustomer.phone}` : '') : search}
        onChange={e => {
          setSearch(e.target.value);
          setSelectedCustomer(null);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        disabled={isLoading}
        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full disabled:opacity-50"
        name="customerComboBoxInput"
        autoComplete="off"
      />
      {showDropdown && search && (
        <div className="absolute z-20 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto mt-1">
          {filtered.length === 0 ? (
            <div className="p-3 text-gray-500 text-sm">No hay clientes</div>
          ) : (
            filtered.map(customer => (
              <button
                key={customer.id}
                type="button"
                onMouseDown={() => {
                  setSelectedCustomer(customer);
                  setSearch('');
                  setShowDropdown(false);
                  setTimeout(() => inputRef.current?.blur(), 0);
                }}
                className={`w-full text-left px-4 py-2 hover:bg-blue-50 ${selectedCustomer?.id === customer.id ? 'bg-blue-100' : ''}`}
              >
                <span className="inline-flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-500" />
                  {customer.name} {customer.phone && `- ${customer.phone}`}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
