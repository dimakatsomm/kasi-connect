'use client';

import React, { useState } from 'react';
import { createProduct } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useCategories } from '@/hooks/useApi';
import { Button, Input } from '@/components/ui';

interface AddProductFormProps {
  vendorId: string;
  onSuccess?: () => void;
}

export function AddProductForm({ vendorId, onSuccess }: AddProductFormProps) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useCategories();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState('');

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const subCategories = selectedCategory?.sub_categories ?? [];

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCategoryId(e.target.value);
    setSelectedSubCategoryId('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('vendorId', vendorId);
    if (selectedSubCategoryId) {
      formData.set('subCategoryId', selectedSubCategoryId);
    }

    try {
      await createProduct(formData);
      queryClient.invalidateQueries({ queryKey: ['products', vendorId] });
      form.reset();
      setSelectedCategoryId('');
      setSelectedSubCategoryId('');
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

      {/* Category & Sub-category */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
          <select
            value={selectedCategoryId}
            onChange={handleCategoryChange}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">No category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Sub-category</label>
          <select
            value={selectedSubCategoryId}
            onChange={(e) => setSelectedSubCategoryId(e.target.value)}
            disabled={!selectedCategoryId}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">Select sub-category</option>
            {subCategories.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>
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
