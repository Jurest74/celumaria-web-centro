import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Customer } from '../types';

interface UsePaginatedCustomersOptions {
  searchTerm?: string;
  birthdayFilter?: 'all' | 'today' | 'week' | 'month';
  sortBy?: 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  itemsPerPage?: number;
}

export function usePaginatedCustomers({
  searchTerm = '',
  birthdayFilter = 'all',
  sortBy = 'name',
  sortOrder = 'asc',
  itemsPerPage = 10,
}: UsePaginatedCustomersOptions) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);

  // Helper functions for birthday filtering
  const isBirthdayToday = useCallback((birthDate: string) => {
    const today = new Date();
    const [, month, day] = birthDate.split('-').map(Number);
    return today.getDate() === day && (today.getMonth() + 1) === month;
  }, []);

  const isBirthdayThisWeek = useCallback((birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    const thisYear = today.getFullYear();
    const birthdayThisYear = new Date(thisYear, birth.getMonth(), birth.getDate());
    const firstDayOfWeek = new Date(today);
    firstDayOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const lastDayOfWeek = new Date(firstDayOfWeek);
    lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
    return birthdayThisYear >= firstDayOfWeek && birthdayThisYear <= lastDayOfWeek;
  }, []);

  const isBirthdayThisMonth = useCallback((birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    return today.getMonth() === birth.getMonth();
  }, []);

  // Helper to build Firestore query
  const buildQuery = useCallback(async (page: number, prevLastDoc: any = null) => {
    let q = collection(db, 'customers');
    let constraints: any[] = [];

    // Order
    let orderField = 'name';
    if (sortBy === 'createdAt') orderField = 'createdAt';
    constraints.push(orderBy(orderField, sortOrder));

    // Pagination
    constraints.push(limit(itemsPerPage + 1)); // +1 to check if there is next page
    if (prevLastDoc) constraints.push(startAfter(prevLastDoc));

    // Build query
    return query(q, ...constraints);
  }, [sortBy, sortOrder, itemsPerPage]);

  // Helper to filter customers on client side (for complex filters)
  const filterCustomersClientSide = useCallback((customersList: Customer[]) => {
    return customersList.filter(customer => {
      // Search term filter (name, phone, email)
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase();
        const matchesName = customer.name.toLowerCase().includes(searchLower);
        const matchesPhone = customer.phone && customer.phone.toLowerCase().includes(searchLower);
        const matchesEmail = customer.email && customer.email.toLowerCase().includes(searchLower);
        
        if (!matchesName && !matchesPhone && !matchesEmail) {
          return false;
        }
      }

      // Birthday filter
      if (birthdayFilter !== 'all') {
        if (!customer.birthDate) return false;
        if (birthdayFilter === 'today') return isBirthdayToday(customer.birthDate);
        if (birthdayFilter === 'week') return isBirthdayThisWeek(customer.birthDate);
        if (birthdayFilter === 'month') return isBirthdayThisMonth(customer.birthDate);
      }

      return true;
    });
  }, [searchTerm, birthdayFilter, isBirthdayToday, isBirthdayThisWeek, isBirthdayThisMonth]);

  // Fetch customers
  const fetchCustomers = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      // If there's a search term or birthday filter, fetch ALL customers and filter client-side
      // This allows searching across all pages
      if (searchTerm.trim() || birthdayFilter !== 'all') {
        // Fetch all customers
        let q = collection(db, 'customers');
        let constraints: any[] = [];

        // Order
        let orderField = 'name';
        if (sortBy === 'createdAt') orderField = 'createdAt';
        constraints.push(orderBy(orderField, sortOrder));

        const fullQuery = query(q, ...constraints);
        const snap = await getDocs(fullQuery);
        let allCustomers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Customer[];

        // Apply client-side filters
        allCustomers = filterCustomersClientSide(allCustomers);

        // Calculate pagination
        const totalPages = Math.ceil(allCustomers.length / itemsPerPage);
        const startIdx = (page - 1) * itemsPerPage;
        const endIdx = startIdx + itemsPerPage;
        const paginatedCustomers = allCustomers.slice(startIdx, endIdx);

        setHasNextPage(page < totalPages);
        setHasPrevPage(page > 1);
        setCustomers(paginatedCustomers);
        setLastDoc(null);
      } else {
        // No search/filter: use efficient Firestore pagination
        let prevLastDoc = null;
        let docsFetched: any[] = [];
        let lastVisible = null;

        // For deep pagination, we need to walk pages
        for (let i = 1; i <= page; i++) {
          const q = await buildQuery(i, prevLastDoc);
          const snap = await getDocs(q);
          const docs = snap.docs;
          if (i === page) {
            docsFetched = docs;
          }
          lastVisible = docs[docs.length - 1];
          prevLastDoc = lastVisible;
        }

        let customersList = docsFetched.map(doc => ({ id: doc.id, ...doc.data() })) as Customer[];

        setHasNextPage(customersList.length > itemsPerPage);
        setHasPrevPage(page > 1);
        if (customersList.length > itemsPerPage) customersList = customersList.slice(0, itemsPerPage);
        setCustomers(customersList);
        setLastDoc(lastVisible);
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  }, [buildQuery, itemsPerPage, filterCustomersClientSide, searchTerm, birthdayFilter, sortBy, sortOrder]);

  // Refetch on filter/sort change
  useEffect(() => {
    setCurrentPage(1);
    fetchCustomers(1);
  }, [searchTerm, birthdayFilter, sortBy, sortOrder, itemsPerPage, fetchCustomers]);

  // Pagination handlers
  const nextPage = () => {
    if (hasNextPage) {
      setCurrentPage((p) => p + 1);
      fetchCustomers(currentPage + 1);
    }
  };
  
  const prevPage = () => {
    if (hasPrevPage && currentPage > 1) {
      setCurrentPage((p) => p - 1);
      fetchCustomers(currentPage - 1);
    }
  };

  return {
    customers,
    loading,
    error,
    currentPage,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    setPage: (page: number) => {
      setCurrentPage(page);
      fetchCustomers(page);
    },
    refetch: () => fetchCustomers(currentPage),
  };
}
