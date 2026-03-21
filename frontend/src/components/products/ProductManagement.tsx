'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import type { Product } from '@/types';
import { useProducts, useUpdateProduct } from '@/hooks/useApi';
import { publishDailySpecial } from '@/lib/api';
import { Button, Badge, Card, Spinner, Modal, Textarea } from '@/components/ui';

interface ProductManagementProps {
  vendorId: string;
}

export function ProductManagement({ vendorId }: ProductManagementProps) {
  const { data: products = [], isLoading, error } = useProducts(vendorId);
  const updateProduct = useUpdateProduct();
  const [specialModal, setSpecialModal] = useState<string | null>(null);
  const [specialMessage, setSpecialMessage] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  if (isLoading) {
    return <Spinner className="h-32" />;
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
          <Card
            key={product.id}
            className={`hover:shadow-md transition-shadow ${
              !product.is_available ? 'opacity-60' : ''
            }`}
          >
            {/* Product image */}
            {product.image_url ? (
              <div className="relative w-full h-36 mb-3">
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  className="object-cover rounded-md"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
            ) : (
              <div className="w-full h-36 bg-slate-100 rounded-md mb-3 flex items-center justify-center text-slate-400 text-3xl">
                🛒
              </div>
            )}

            <div className="flex justify-between items-start mb-1">
              <h3 className="font-semibold text-slate-800">{product.name}</h3>
              <span className="text-emerald-700 font-bold text-sm">
                R{product.is_special && product.special_price
                  ? Number(product.special_price).toFixed(2)
                  : Number(product.price).toFixed(2)}
              </span>
            </div>

            {product.is_special && (
              <Badge color="amber">
                🌟 Special
              </Badge>
            )}

            {/* Stock level */}
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
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
              <Button
                onClick={() => handleToggleAvailability(product)}
                variant={product.is_available ? 'ghost' : 'accent-solid'}
                size="xs"
                className="flex-1"
              >
                {product.is_available ? 'Disable' : 'Enable'}
              </Button>

              <Button
                onClick={() => setSpecialModal(product.id)}
                variant="accent"
                size="xs"
                className="flex-1"
              >
                🌟 Special
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Special broadcast modal */}
      <Modal open={!!specialModal} onClose={() => setSpecialModal(null)}>
        <h3 className="text-lg font-bold text-slate-800 mb-3">📢 Broadcast Daily Special</h3>
        <p className="text-sm text-slate-500 mb-3">
          This message will be sent to all customers who ordered in the last 30 days.
        </p>
        <Textarea
          value={specialMessage}
          onChange={(e) => setSpecialMessage(e.target.value)}
          placeholder="Today's special: Pap and wors for only R35! 🔥"
          className="h-24"
        />
        <div className="flex gap-3 mt-4">
          <Button
            onClick={() => setSpecialModal(null)}
            variant="secondary"
            size="sm"
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={() => specialModal && handleBroadcastSpecial(specialModal)}
            disabled={broadcastLoading || !specialMessage.trim()}
            size="sm"
            className="flex-1"
          >
            {broadcastLoading ? 'Sending...' : 'Send to Customers'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
