// Shared TypeScript types for KasiConnect frontend

export type VendorType = 'retail' | 'food';
export type FulfilmentType = 'collection' | 'delivery';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export interface Vendor {
  id: string;
  name: string;
  type: VendorType;
  phone: string;
  address?: string;
  whatsapp_number?: string;
  delivery_fee: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  keywords: string[];
  sub_categories: SubCategory[];
  created_at: string;
  updated_at: string;
}

export interface SubCategory {
  id: string;
  category_id: string;
  name: string;
  description?: string;
  keywords: string[];
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  vendor_id: string;
  sub_category_id?: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  stock_level: number;
  low_stock_threshold: number;
  is_available: boolean;
  is_special: boolean;
  special_price?: number;
  aliases: string[];
  sub_category?: SubCategory & { category?: Category };
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Order {
  id: string;
  vendor_id: string;
  customer_id: string;
  customer_phone: string;
  customer_name?: string;
  status: OrderStatus;
  fulfilment_type: FulfilmentType;
  delivery_address?: string;
  delivery_fee: number;
  subtotal: number;
  total: number;
  queue_position?: number;
  estimated_ready_time?: string;
  notes?: string;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface DailySpecial {
  id: string;
  vendor_id: string;
  product_id: string;
  message: string;
  valid_date: string;
  broadcast_sent_at?: string;
  created_at: string;
}

// Kanban column definitions
export const KANBAN_COLUMNS: { status: OrderStatus; label: string; colour: string }[] = [
  { status: 'confirmed', label: 'New', colour: 'bg-sky-50 border-sky-300' },
  { status: 'preparing', label: 'Preparing', colour: 'bg-amber-50 border-amber-300' },
  { status: 'ready', label: 'Ready', colour: 'bg-emerald-50 border-emerald-400' },
];

// Status transitions for the vendor dashboard buttons
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus | null> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
  delivered: null,
  cancelled: null,
};

export const STATUS_ACTION_LABELS: Record<OrderStatus, string> = {
  pending: 'Confirm',
  confirmed: 'Start Preparing',
  preparing: 'Mark Ready',
  ready: 'Mark Delivered',
  delivered: '',
  cancelled: '',
};
