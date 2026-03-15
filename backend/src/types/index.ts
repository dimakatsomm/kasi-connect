// ── Domain scalar types ───────────────────────────────────────────────────────

export type VendorType = 'retail' | 'food';
export type FulfilmentType = 'collection' | 'delivery';
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

// ── Database row shapes ───────────────────────────────────────────────────────

export interface VendorRow {
  id: string;
  name: string;
  type: VendorType;
  phone: string;
  address: string | null;
  whatsapp_number: string | null;
  delivery_fee: number | string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  price: number | string;
  image_url: string | null;
  stock_level: number;
  low_stock_threshold: number;
  is_available: boolean;
  is_special: boolean;
  special_price: number | string | null;
  aliases: string[];
  created_at: string;
  updated_at: string;
}

export interface CustomerRow {
  id: string;
  phone: string;
  name: string | null;
  last_order_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  vendor_id: string;
  customer_id: string;
  status: OrderStatus;
  fulfilment_type: FulfilmentType;
  delivery_address: string | null;
  delivery_fee: number | string;
  subtotal: number | string;
  total: number | string;
  queue_position: number | null;
  estimated_ready_time: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
}

// ── NLP types ─────────────────────────────────────────────────────────────────

export interface ParsedItem {
  quantity: number;
  name: string;
  raw: string;
}

// ── Product matching types ────────────────────────────────────────────────────

export interface MatchedItem {
  item: ParsedItem;
  product: ProductRow;
  quantity: number;
}

export interface AmbiguousItem {
  item: ParsedItem;
  candidates: ProductRow[];
}

export interface UnmatchedItem {
  item: ParsedItem;
}

export interface MatchProductsResult {
  matched: MatchedItem[];
  ambiguous: AmbiguousItem[];
  unmatched: UnmatchedItem[];
}

export interface OrderSummary {
  lines: string[];
  subtotal: number;
  total: number;
}

// ── Session types ─────────────────────────────────────────────────────────────

export interface LastOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number | string;
}

export interface PendingClarification {
  item: ParsedItem;
  candidates: ProductRow[];
  matchedSoFar: MatchedItem[];
  remainingAmbiguous: AmbiguousItem[];
  unmatched: UnmatchedItem[];
}

export interface Session {
  phone: string;
  vendorId: string | null;
  state: string; // SessionState union — kept as string to avoid circular dep
  items: MatchedItem[];
  pendingClarification: PendingClarification | null;
  fulfilmentType: FulfilmentType | null;
  deliveryAddress: string | null;
  lastOrderId: string | null;
  lastOrderItems?: LastOrderItem[];
  createdAt: number;
  updatedAt: number;
}

// ── Order service types ───────────────────────────────────────────────────────

export interface CreateOrderParams {
  vendorId: string;
  customerId: string;
  items: MatchedItem[];
  fulfilmentType: FulfilmentType;
  deliveryAddress: string | null;
  deliveryFee: number;
  subtotal: number;
  total: number;
}

export interface UpdateOrderStatusExtra {
  queuePosition?: number;
  estimatedReadyTime?: Date;
}

// ── Kafka types ───────────────────────────────────────────────────────────────

export interface KafkaEventPayload {
  orderId?: string;
  [key: string]: unknown;
}

// ── WhatsApp message types ────────────────────────────────────────────────────

export interface WhatsAppTextContent {
  body: string;
}

export interface WhatsAppAudioContent {
  id: string;
  mime_type?: string;
}

export interface WhatsAppButtonReply {
  id: string;
  title: string;
}

export interface WhatsAppListReply {
  id: string;
  title: string;
}

export interface WhatsAppInteractiveContent {
  type: string;
  button_reply?: WhatsAppButtonReply;
  list_reply?: WhatsAppListReply;
}

export interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'text' | 'audio' | 'interactive' | 'image' | 'document' | 'location' | string;
  text?: WhatsAppTextContent;
  audio?: WhatsAppAudioContent;
  interactive?: WhatsAppInteractiveContent;
}

export interface WhatsAppWebhookBody {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value: {
        messages?: WhatsAppMessage[];
        statuses?: unknown[];
      };
      field: string;
    }>;
  }>;
}
