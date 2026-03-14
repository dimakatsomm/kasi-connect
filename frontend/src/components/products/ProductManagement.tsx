'use client';

import React, { useState } from 'react';
import type { Product } from '@/types';
import { useProducts, useUpdateProduct, useDeleteProduct } from '@/hooks/useApi';
import { publishDailySpecial } from '@/lib/api';

interface ProductManagementProps {
  vendorId: string;
}

export function ProductManagement({ vendorId }: ProductManagementProps) {
  const { data: products = [], isLoading, error } = useProducts(vendorId);
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const [specialModal, setSpecialModal] = useState<string | null>(null);
  const [specialMessage, setSpecialMessage] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
        Failed to load products. Please refresh.
      </div>
    );
  }

  const handleToggleAvailability = (product: Product) => {
    updateProduct.mutate({
      productId: product.id,
      updates: { is_available: !product.is_available },
    });
  };

  const handleBroadcastSpecial = async (productId: string) => {
    if (!specialMessage.trim()) return;
    setBroadcastLoading(true);
    try {
      await publishDailySpecial({ vendorId, productId, message: specialMessage });
      setSpecialModal(null);
      setSpecialMessage('');
    } catch {
      alert('Failed to broadcast special. Please try again.');
    } finally {
      setBroadcastLoading(false);
    }
  };

  const lowStockProducts = products.filter(
    (p) => p.stock_level <= p.low_stock_threshold && p.is_available
  );

  return (
    <div>
      {/* Low stock alert */}
      {lowStockProducts.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-4 text-sm">
          <span className="font-semibold text-amber-800">⚠️ Low stock: </span>
          <span className="text-amber-700">
            {lowStockProducts.map((p) => `${p.name} (${p.stock_level} left)`).join(', ')}
          </span>
        </div>
      )}

      {/* Product grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product) => (
          <div
            key={product.id}
            className={`bg-white rounded-lg border p-4 shadow-sm ${
              !product.is_available ? 'opacity-60' : ''
            }`}
          >
            {/* Product image */}
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-36 object-cover rounded-md mb-3"
              />
            ) : (
              <div className="w-full h-36 bg-gray-100 rounded-md mb-3 flex items-center justify-center text-gray-400 text-3xl">
                🛒
              </div>
            )}

            <div className="flex justify-between items-start mb-1">
              <h3 className="font-semibold text-gray-800">{product.name}</h3>
              <span className="text-orange-600 font-bold text-sm">
                R{product.is_special && product.special_price
                  ? Number(product.special_price).toFixed(2)
                  : Number(product.price).toFixed(2)}
              </span>
            </div>

            {product.is_special && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                🌟 Special
              </span>
            )}

            {/* Stock level */}
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  product.stock_level <= product.low_stock_threshold
                    ? 'bg-red-400'
                    : 'bg-green-400'
                }`}
              />
              Stock: {product.stock_level}
              {product.stock_level <= product.low_stock_threshold && (
                <span className="text-red-500 font-medium">Low</span>
              )}
            </div>

            {/* Actions */}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => handleToggleAvailability(product)}
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                  product.is_available
                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    : 'bg-green-100 hover:bg-green-200 text-green-700'
                }`}
              >
                {product.is_available ? 'Disable' : 'Enable'}
              </button>

              <button
                onClick={() => setSpecialModal(product.id)}
                className="flex-1 text-xs py-1.5 rounded-md font-medium bg-orange-100 hover:bg-orange-200 text-orange-700 transition-colors"
              >
                🌟 Special
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Special broadcast modal */}
      {specialModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-gray-800 mb-3">📢 Broadcast Daily Special</h3>
            <p className="text-sm text-gray-500 mb-3">
              This message will be sent to all customers who ordered in the last 30 days.
            </p>
            <textarea
              value={specialMessage}
              onChange={(e) => setSpecialMessage(e.target.value)}
              placeholder="Today's special: Pap and wors for only R35! 🔥"
              className="w-full border rounded-lg p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setSpecialModal(null)}
                className="flex-1 py-2 rounded-lg border text-gray-600 hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleBroadcastSpecial(specialModal)}
                disabled={broadcastLoading || !specialMessage.trim()}
                className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {broadcastLoading ? 'Sending...' : 'Send to Customers'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
