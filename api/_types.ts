export interface Cake {
  id: number;
  name: string;
  description: string;
  ingredients: string[];
  category: 'comum' | 'com_cobertura';
  price: number;
  stock_quantity: number;
  image_url: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OrderItem {
  id?: number;
  order_id?: number;
  cake_id: number;
  cake_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export type OrderStatus = 'pendente' | 'confirmado' | 'preparando' | 'pronto' | 'entregue' | 'cancelado';
export type PaymentMethod = 'pix' | 'credito';
export interface Order {
  id: number;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  delivery_block: string;
  delivery_apartment: string;
  notes?: string;
  payment_method: PaymentMethod;
  total_amount: number;
  status: OrderStatus;
  telegram_sent: boolean;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}

export interface InventoryLog {
  id: number;
  cake_id: number;
  cake_name?: string;
  change_amount: number;
  new_stock: number;
  reason: string;
  notes?: string;
  created_at: string;
}

export interface AppStats {
  totalCakes: number;
  activeCakes: number;
  totalUnitsInStock: number;
  lowStockCount: number; // <= 2 unidades
  pendingOrdersCount: number;
  totalOrdersCount: number;
  estimatedRevenue: number;
}

export interface TelegramSettings {
  adminUsername: string;
  adminName: string;
  botConfigured: boolean;
}
