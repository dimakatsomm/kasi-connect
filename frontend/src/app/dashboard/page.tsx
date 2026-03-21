'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { KanbanBoard } from '@/components/orders/KanbanBoard';
import { ProductManagement } from '@/components/products/ProductManagement';
import { AddProductForm } from '@/components/products/AddProductForm';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';

type Tab = 'orders' | 'products' | 'add-product';

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('orders');

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  const vendorId = user.vendorId;

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
            <div className="font-medium">{user.vendorName}</div>
            <button
              onClick={logout}
              className="text-emerald-300 hover:text-white transition-colors mt-0.5"
            >
              Sign out
            </button>
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
            <KanbanBoard vendorId={vendorId} />
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
            <ProductManagement vendorId={vendorId} />
          </div>
        )}

        {activeTab === 'add-product' && (
          <div className="max-w-lg mx-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Add New Product</h2>
            <Card padding="lg" className="rounded-xl">
              <AddProductForm
                vendorId={vendorId}
                onSuccess={() => setActiveTab('products')}
              />
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
