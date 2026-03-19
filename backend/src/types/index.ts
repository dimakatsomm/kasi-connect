import type {
  Vendor as PrismaVendor,
  Product as PrismaProduct,
  Customer as PrismaCustomer,
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
  VendorType as PrismaVendorType,
  FulfilmentType as PrismaFulfilmentType,
  OrderStatus as PrismaOrderStatus,
} from '@prisma/client';

// -- Domain scalar types -------------------------------------------------------

export type VendorType = PrismaVendorType;
export type FulfilmentType = PrismaFulfilmentType;
export type OrderStatus = PrismaOrderStatus;

// -- Database row shapes -------------------------------------------------------

export type VendorRow = PrismaVendor;
export type ProductRow = PrismaProduct;
export type CustomerRow = PrismaCustomer;
export type OrderRow = PrismaOrder;
export type OrderItemRow = PrismaOrderItem;

// -- NLP types -----------------------------------------------------------------

export interface ParsedItem {
  quantity: number;
  name: string;
  raw: string;
}

// -- Product matching types ----------------------------------------------------

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

// -- Session types -------------------------------------------------------------

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

// -- Order service types -------------------------------------------------------

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

// -- Kafka types ----------------------------------------------------------------

export interface KafkaEventPayload {
  orderId?: string;
  [key: string]: unknown;
}

// -- WhatsApp message types ----------------------------------------------------

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
