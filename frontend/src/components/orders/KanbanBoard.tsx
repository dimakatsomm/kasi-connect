'use client';

import React from 'react';
import type { Order } from '@/types';
import { KANBAN_COLUMNS, STATUS_TRANSITIONS, STATUS_ACTION_LABELS } from '@/types';
import { useOrders, useUpdateOrderStatus } from '@/hooks/useApi';
import { format } from 'date-fns';

interface KanbanBoardProps {
  vendorId: string;
}

export function KanbanBoard({ vendorId }: KanbanBoardProps) {
  const { data: orders = [], isLoading, error } = useOrders(vendorId);
  const updateStatus = useUpdateOrderStatus();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
        Failed to load orders. Please refresh.
      </div>
    );
  }

  const columns = KANBAN_COLUMNS.map((col) => ({
    ...col,
    orders: orders.filter((o) => o.status === col.status),
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {columns.map((col) => (
        <div key={col.status} className={`rounded-lg border-2 p-3 min-h-[200px] ${col.colour}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">{col.label}</h2>
            <span className="bg-white text-gray-600 text-xs font-bold px-2 py-1 rounded-full">
              {col.orders.length}
            </span>
          </div>

          <div className="space-y-2">
            {col.orders.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No orders</p>
            )}
            {col.orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onStatusChange={(status) =>
                  updateStatus.mutate({ orderId: order.id, status })
                }
                isUpdating={updateStatus.isPending}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface OrderCardProps {
  order: Order;
  onStatusChange: (status: Order['status']) => void;
  isUpdating: boolean;
}

function OrderCard({ order, onStatusChange, isUpdating }: OrderCardProps) {
  const nextStatus = STATUS_TRANSITIONS[order.status];
  const actionLabel = STATUS_ACTION_LABELS[order.status];
  const createdAt = format(new Date(order.created_at), 'HH:mm');

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 text-sm">
      {/* Header */}
      <div className="flex justify-between items-start mb-2">
        <div>
          <span className="font-bold text-gray-800">#{order.id.slice(-6).toUpperCase()}</span>
          <span className="text-gray-400 text-xs ml-2">{createdAt}</span>
        </div>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            order.fulfilment_type === 'delivery'
              ? 'bg-purple-100 text-purple-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {order.fulfilment_type === 'delivery' ? '🚗 Delivery' : '🏪 Collect'}
        </span>
      </div>

      {/* Customer */}
      <div className="text-gray-500 text-xs mb-2">
        📱 {order.customer_phone}
        {order.customer_name && ` · ${order.customer_name}`}
      </div>

      {/* Items */}
      <ul className="space-y-0.5 mb-2">
        {order.items.map((item, i) => (
          <li key={i} className="flex justify-between text-gray-700">
            <span>
              {item.quantity}× {item.productName}
            </span>
            <span className="text-gray-500">R{item.totalPrice.toFixed(2)}</span>
          </li>
        ))}
      </ul>

      {/* Total */}
      <div className="flex justify-between font-semibold text-gray-800 border-t pt-1 mt-1">
        <span>Total</span>
        <span>R{Number(order.total).toFixed(2)}</span>
      </div>

      {/* Queue info (food vendors) */}
      {order.queue_position && (
        <div className="text-xs text-orange-600 mt-1">
          Queue #{order.queue_position}
          {order.estimated_ready_time &&
            ` · Ready ~${format(new Date(order.estimated_ready_time), 'HH:mm')}`}
        </div>
      )}

      {/* Action button */}
      {nextStatus && actionLabel && (
        <button
          onClick={() => onStatusChange(nextStatus)}
          disabled={isUpdating}
          className="mt-2 w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50
                     text-white text-xs font-semibold py-1.5 rounded-md transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
