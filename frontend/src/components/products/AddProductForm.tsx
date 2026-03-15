'use client';

import React, { useState } from 'react';
import { createProduct } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface AddProductFormProps {
  vendorId: string;
  onSuccess?: () => void;
}

export function AddProductForm({ vendorId, onSuccess }: AddProductFormProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('vendorId', vendorId);

    try {
      await createProduct(formData);
      queryClient.invalidateQueries({ queryKey: ['products', vendorId] });
      form.reset();
      onSuccess?.();
    } catch {
      setError('Failed to create product. Please check the form and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
        <input
          name="name"
          required
          placeholder="e.g. White Bread 700g"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <input
          name="description"
          placeholder="Optional description"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price (R) *</label>
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="0.00"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Stock Level</label>
          <input
            name="stockLevel"
            type="number"
            min="0"
            defaultValue="0"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Aliases (comma-separated)
        </label>
        <input
          name="aliases"
          placeholder="e.g. bread, loaf, mkate, sinkwa"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <p className="text-xs text-gray-400 mt-1">
          Alternative names customers might use in WhatsApp messages
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Product Image</label>
        <input
          name="image"
          type="file"
          accept="image/*"
          className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-orange-100 file:text-orange-700 file:font-medium hover:file:bg-orange-200"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        {loading ? 'Adding...' : 'Add Product'}
      </button>
    </form>
  );
}
