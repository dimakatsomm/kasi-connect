'use client';

import React, { useState } from 'react';
import { KanbanBoard } from '@/components/orders/KanbanBoard';
import { ProductManagement } from '@/components/products/ProductManagement';
import { AddProductForm } from '@/components/products/AddProductForm';
import { Button, Card } from '@/components/ui';

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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-emerald-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛍️</span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">KasiConnect</h1>
              <p className="text-emerald-200 text-xs">Vendor Dashboard</p>
            </div>
          </div>
          <div className="text-right text-xs text-emerald-200">
            <div className="font-medium">Order Management</div>
            <div className="opacity-75">WhatsApp Ordering Platform</div>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
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
              <h2 className="text-lg font-semibold text-slate-800">Live Orders</h2>
              <span className="text-xs text-slate-400">Auto-refreshes every 15s</span>
            </div>
            <KanbanBoard vendorId={VENDOR_ID} />
          </div>
        )}

        {activeTab === 'products' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Product Catalogue</h2>
              <Button onClick={() => setActiveTab('add-product')} size="sm">
                ➕ Add Product
              </Button>
            </div>
            <ProductManagement vendorId={VENDOR_ID} />
          </div>
        )}

        {activeTab === 'add-product' && (
          <div className="max-w-lg mx-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Add New Product</h2>
            <Card padding="lg" className="rounded-xl">
              <AddProductForm
                vendorId={VENDOR_ID}
                onSuccess={() => setActiveTab('products')}
              />
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
