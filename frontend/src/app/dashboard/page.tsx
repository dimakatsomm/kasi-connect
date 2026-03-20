'use client';

import React, { useState } from 'react';
import { KanbanBoard } from '@/components/orders/KanbanBoard';
import { ProductManagement } from '@/components/products/ProductManagement';
import { AddProductForm } from '@/components/products/AddProductForm';

// In production, vendorId would come from auth session.
// For the MVP demo, we use an env var. Set NEXT_PUBLIC_VENDOR_ID to a valid
// vendor UUID from the database (e.g. in frontend/.env.local).
const VENDOR_ID = process.env.NEXT_PUBLIC_VENDOR_ID || '00000000-0000-4000-a000-000000000001';

type Tab = 'orders' | 'products' | 'add-product';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('orders');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'orders', label: 'Orders', icon: '📋' },
    { id: 'products', label: 'Products', icon: '🛒' },
    { id: 'add-product', label: 'Add Product', icon: '➕' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-400 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛍️</span>
            <div>
              <h1 className="text-xl font-bold">KasiConnect</h1>
              <p className="text-gray-300 text-xs">Vendor Dashboard</p>
            </div>
          </div>
          <div className="text-right text-xs text-gray-300">
            <div className="font-medium">Order Management</div>
            <div className="opacity-75">WhatsApp Ordering Platform</div>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <nav className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-gray-400 text-gray-500'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'orders' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Live Orders</h2>
              <span className="text-xs text-gray-400">Auto-refreshes every 15s</span>
            </div>
            <KanbanBoard vendorId={VENDOR_ID} />
          </div>
        )}

        {activeTab === 'products' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Product Catalogue</h2>
              <button
                onClick={() => setActiveTab('add-product')}
                className="text-sm bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                ➕ Add Product
              </button>
            </div>
            <ProductManagement vendorId={VENDOR_ID} />
          </div>
        )}

        {activeTab === 'add-product' && (
          <div className="max-w-lg mx-auto">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Add New Product</h2>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <AddProductForm
                vendorId={VENDOR_ID}
                onSuccess={() => setActiveTab('products')}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
