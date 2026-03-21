'use client';

import React, { useState } from 'react';
import { createProduct } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Input } from '@/components/ui';

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
      <Input
        name="name"
        required
        label="Product Name *"
        placeholder="e.g. White Bread 700g"
      />

      <Input
        name="description"
        label="Description"
        placeholder="Optional description"
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          name="price"
          type="number"
          step="0.01"
          min="0"
          required
          label="Price (R) *"
          placeholder="0.00"
        />

        <Input
          name="stockLevel"
          type="number"
          min="0"
          defaultValue="0"
          label="Stock Level"
        />
      </div>

      <Input
        name="aliases"
        label="Aliases (comma-separated)"
        placeholder="e.g. bread, loaf, mkate, sinkwa"
        hint="Alternative names customers might use in WhatsApp messages"
      />

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Product Image</label>
        <input
          name="image"
          type="file"
          accept="image/*"
          className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-100 file:text-emerald-700 file:font-medium hover:file:bg-emerald-200"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      <Button type="submit" disabled={loading} size="md" fullWidth>
        {loading ? 'Adding...' : 'Add Product'}
      </Button>
    </form>
  );
}
