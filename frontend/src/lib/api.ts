import axios from 'axios';
import type { Order, OrderStatus, Product, Vendor, Category } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// ── Orders ────────────────────────────────────────────────────────────────────

export async function fetchOrders(vendorId: string, statuses?: OrderStatus[]): Promise<Order[]> {
  const params: Record<string, string> = { vendorId };
  if (statuses?.length) params.status = statuses.join(',');
  const { data } = await apiClient.get('/api/orders', { params });
  return data.orders;
}

export async function fetchOrder(orderId: string): Promise<Order> {
  const { data } = await apiClient.get(`/api/orders/${orderId}`);
  return data.order;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
  const { data } = await apiClient.patch(`/api/orders/${orderId}/status`, { status });
  return data.order;
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function fetchProducts(vendorId: string): Promise<Product[]> {
  const { data } = await apiClient.get('/api/products', { params: { vendorId } });
  return data.products;
}

export async function createProduct(formData: FormData): Promise<Product> {
  const { data } = await apiClient.post('/api/products', formData, {
    headers: { 'Content-Type': undefined },
  });
  return data.product;
}

export async function updateProduct(productId: string, updates: Partial<Product>): Promise<Product> {
  const { data } = await apiClient.patch(`/api/products/${productId}`, updates);
  return data.product;
}

export async function deleteProduct(productId: string): Promise<void> {
  await apiClient.delete(`/api/products/${productId}`);
}

export async function publishDailySpecial(payload: {
  vendorId: string;
  productId: string;
  message: string;
}): Promise<void> {
  await apiClient.post('/api/products/specials', payload);
}

// ── Vendors ───────────────────────────────────────────────────────────────────

export async function fetchVendors(): Promise<Vendor[]> {
  const { data } = await apiClient.get('/api/vendors');
  return data.vendors;
}

export async function fetchVendor(vendorId: string): Promise<Vendor> {
  const { data } = await apiClient.get(`/api/vendors/${vendorId}`);
  return data.vendor;
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function fetchCategories(): Promise<Category[]> {
  const { data } = await apiClient.get('/api/categories');
  return data.categories;
}
