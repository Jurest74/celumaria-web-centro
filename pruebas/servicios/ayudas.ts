// Utilidades para sembrar datos de prueba y leer el resultado en el emulador.
import { addDoc, collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { configureStore } from '@reduxjs/toolkit';
import { db, PROYECTO_PRUEBAS } from '../../src/config/firebase';
import { COLLECTIONS } from '../../src/services/firebase/collections';
import firebaseReducer from '../../src/store/slices/firebaseSlice';
import type { CourtesyItem, Sale, SaleItem } from '../../src/types';

const HOST = process.env.VITE_EMULADOR_HOST || '127.0.0.1';
const AHORA = () => new Date().toISOString();

/** Borra todos los documentos del emulador. Solo existe en el emulador. */
export async function limpiarEmulador(): Promise<void> {
  const respuesta = await fetch(
    `http://${HOST}:8080/emulator/v1/projects/${PROYECTO_PRUEBAS}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  if (!respuesta.ok) {
    throw new Error(`No se pudo limpiar el emulador (${respuesta.status}). ¿Está corriendo?`);
  }
}

export interface ProductoPrueba {
  id: string;
  nombre: string;
  compra: number;
  venta: number;
}

export async function crearCategoria(nombre = 'Accesorios'): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.CATEGORIES), {
    name: nombre, description: '', color: '#3B82F6', icon: 'Tag', isActive: true, productCount: 0,
    createdAt: AHORA(), updatedAt: AHORA(),
  });
  return ref.id;
}

export async function crearProducto(
  nombre: string, stock: number, compra = 60000, venta = 100000, categoria?: { id: string; nombre: string }
): Promise<ProductoPrueba> {
  const ref = await addDoc(collection(db, COLLECTIONS.PRODUCTS), {
    name: nombre,
    description: 'Producto de prueba',
    purchasePrice: compra,
    salePrice: venta,
    stock,
    categoryId: categoria?.id ?? '',
    category: categoria?.nombre ?? 'Pruebas',
    createdAt: AHORA(),
    updatedAt: AHORA(),
  });
  return { id: ref.id, nombre, compra, venta };
}

export async function crearCliente(nombre: string, saldo = 0): Promise<string> {
  const ref = doc(collection(db, COLLECTIONS.CUSTOMERS));
  await setDoc(ref, { name: nombre, phone: '3000000000', credit: saldo, createdAt: AHORA(), updatedAt: AHORA() });
  return ref.id;
}

export async function stockDe(productId: string): Promise<number> {
  const snap = await getDoc(doc(db, COLLECTIONS.PRODUCTS, productId));
  return Number(snap.data()?.stock ?? NaN);
}

export async function saldoDe(customerId: string): Promise<number> {
  const snap = await getDoc(doc(db, COLLECTIONS.CUSTOMERS, customerId));
  return Number(snap.data()?.credit ?? NaN);
}

export async function documentos<T = Record<string, unknown>>(coleccion: string): Promise<(T & { id: string })[]> {
  const snap = await getDocs(collection(db, coleccion));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as T) }));
}

export function linea(producto: ProductoPrueba, cantidad: number): SaleItem {
  return {
    productId: producto.id,
    productName: producto.nombre,
    quantity: cantidad,
    purchasePrice: producto.compra,
    salePrice: producto.venta,
    totalCost: producto.compra * cantidad,
    totalRevenue: producto.venta * cantidad,
    profit: (producto.venta - producto.compra) * cantidad,
  };
}

export function cortesia(producto: ProductoPrueba, cantidad: number): CourtesyItem {
  return {
    productId: producto.id,
    productName: producto.nombre,
    quantity: cantidad,
    normalPrice: producto.venta,
    purchasePrice: producto.compra,
    totalValue: producto.venta * cantidad,
    totalCost: producto.compra * cantidad,
  };
}

/** Venta regular como la arma la pantalla de Ventas. */
export function ventaRegular(items: SaleItem[], extras: Partial<Sale> = {}): Omit<Sale, 'id' | 'createdAt'> {
  const total = items.reduce((s, i) => s + i.totalRevenue, 0);
  const costo = items.reduce((s, i) => s + i.totalCost, 0);
  return {
    items,
    subtotal: total,
    discount: 0,
    tax: 0,
    total,
    totalCost: costo,
    totalProfit: total - costo,
    profitMargin: total > 0 ? ((total - costo) / total) * 100 : 0,
    paymentMethod: 'efectivo',
    customerName: 'Cliente de prueba',
    salesPersonId: 'vendedor-prueba',
    salesPersonName: 'Vendedor de prueba',
    type: 'regular',
    ...extras,
  };
}

/** Store de Redux mínimo para ejecutar los thunks reales. */
export function crearStore() {
  return configureStore({ reducer: { firebase: firebaseReducer } });
}
