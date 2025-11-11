import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Product } from '../types';

interface UsePaginatedProductsOptions {
  searchTerm?: string;
  categoryFilter?: string;
  stockFilter?: 'all' | 'low' | 'out';
  sortBy?: 'name' | 'stock' | 'salePrice' | 'purchasePrice';
  sortOrder?: 'asc' | 'desc';
  itemsPerPage?: number;
}

export function usePaginatedProducts({
  searchTerm = '',
  categoryFilter = 'all',
  stockFilter = 'all',
  sortBy = 'name',
  sortOrder = 'asc',
  itemsPerPage = 10,
}: UsePaginatedProductsOptions) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);

  // Helper to build Firestore query
  const buildQuery = useCallback(async (prevLastDoc: any = null) => {
    let q = collection(db, 'products');
    let constraints: any[] = [];

    // For search, we'll do client-side filtering to ensure case-insensitive search
    // No Firestore text filtering to avoid case-sensitivity issues

    // Category filter
    if (categoryFilter !== 'all') {
      constraints.push(where('categoryId', '==', categoryFilter));
    }

    // Stock filter
    if (stockFilter === 'low') {
      constraints.push(where('stock', '>', 0));
      constraints.push(where('stock', '<=', 5));
    } else if (stockFilter === 'out') {
      constraints.push(where('stock', '==', 0));
    }

    // Order
    let orderField = sortBy;
    constraints.push(orderBy(orderField, sortOrder));

    // For pagination with search, we need to get ALL results to ensure we find all matches
    // Only limit when not searching to maintain pagination
    const effectiveLimit = searchTerm ? 10000 : itemsPerPage + 1;
    constraints.push(limit(effectiveLimit));
    if (prevLastDoc) constraints.push(startAfter(prevLastDoc));

    // Build query
    return query(q, ...constraints);
  }, [searchTerm, categoryFilter, stockFilter, sortBy, sortOrder, itemsPerPage]);

  // Fetch products
  const fetchProducts = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      let prevLastDoc = null;
      let docsFetched: any[] = [];
      let lastVisible = null;
      
      // When searching, fetch all results in one go, no pagination
      if (searchTerm) {
        const q = await buildQuery(null);
        const snap = await getDocs(q);
        docsFetched = snap.docs;
      } else {
        // Normal pagination when not searching
        for (let i = 1; i <= page; i++) {
          const q = await buildQuery(prevLastDoc);
          const snap = await getDocs(q);
          const docs = snap.docs;
          if (i === page) {
            docsFetched = docs;
          }
          lastVisible = docs[docs.length - 1];
          prevLastDoc = lastVisible;
        }
      }
      
      let productsList = docsFetched.map(doc => ({ id: doc.id, ...doc.data() })) as Product[];
      
      // Apply client-side case-insensitive search filtering
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        productsList = productsList.filter(product => {
          const matchesName = product.name?.toLowerCase().includes(searchLower);
          const matchesDescription = product.description?.toLowerCase().includes(searchLower);
          const matchesReference = product.referencia?.toLowerCase().includes(searchLower);
          const matchesImei = product.imei?.toLowerCase().includes(searchLower);
          const matchesBarcode = product.barcode?.toLowerCase().includes(searchLower);
          return matchesName || matchesDescription || matchesReference || matchesImei || matchesBarcode;
        });
        
        // When searching, show all results without pagination
        setHasNextPage(false);
        setHasPrevPage(false);
      } else {
        // Normal pagination logic when not searching
        setHasNextPage(productsList.length > itemsPerPage);
        setHasPrevPage(page > 1);
      }
      
      // Limit display to itemsPerPage when not searching
      if (!searchTerm && productsList.length > itemsPerPage) {
        productsList = productsList.slice(0, itemsPerPage);
      }
      setProducts(productsList);
    } catch (err: any) {
      setError(err.message || 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  }, [buildQuery, itemsPerPage, searchTerm]);

  // Refetch on filter/sort change
  useEffect(() => {
    setCurrentPage(1);
    fetchProducts(1);
  }, [searchTerm, categoryFilter, stockFilter, sortBy, sortOrder, itemsPerPage, fetchProducts]);

  // Pagination handlers
  const nextPage = () => {
    if (hasNextPage) {
      setCurrentPage((p) => p + 1);
      fetchProducts(currentPage + 1);
    }
  };
  const prevPage = () => {
    if (hasPrevPage && currentPage > 1) {
      setCurrentPage((p) => p - 1);
      fetchProducts(currentPage - 1);
    }
  };

  return {
    products,
    loading,
    error,
    currentPage,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    setPage: (page: number) => {
      setCurrentPage(page);
      fetchProducts(page);
    },
    refetch: () => fetchProducts(currentPage),
  };
}
