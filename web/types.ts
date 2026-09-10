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
export interface Order {
  id: number;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  delivery_block: string;
  delivery_apartment: string;
  notes?: string;
  payment_method: 'pix' | 'credito';
  total_amount: number;
  status: OrderStatus;
  telegram_sent: boolean;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}

export interface AppStats {
  totalCakes: number;
  activeCakes: number;
  totalUnitsInStock: number;
  lowStockCount: number;
  pendingOrdersCount: number;
  totalOrdersCount: number;
  estimatedRevenue: number;
}

export interface CartItem {
  cake: Cake;
  quantity: number;
}
