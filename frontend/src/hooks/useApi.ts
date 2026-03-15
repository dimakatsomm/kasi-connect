'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOrders, updateOrderStatus, fetchProducts, updateProduct, deleteProduct } from '@/lib/api';
import type { OrderStatus, Product } from '@/types';

// ── Orders ────────────────────────────────────────────────────────────────────

export function useOrders(vendorId: string, statuses?: OrderStatus[]) {
  return useQuery({
    queryKey: ['orders', vendorId, statuses],
    queryFn: () => fetchOrders(vendorId, statuses),
    refetchInterval: 15000, // Poll every 15 seconds for real-time feel
    enabled: !!vendorId,
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) =>
      updateOrderStatus(orderId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

// ── Products ──────────────────────────────────────────────────────────────────

export function useProducts(vendorId: string) {
  return useQuery({
    queryKey: ['products', vendorId],
    queryFn: () => fetchProducts(vendorId),
    enabled: !!vendorId,
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, updates }: { productId: string; updates: Partial<Product> }) =>
      updateProduct(productId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) => deleteProduct(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
