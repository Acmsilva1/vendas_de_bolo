export interface ReservedCartItem<TCake> {
  cake: TCake;
  quantity: number;
  expires_at: string;
  status: 'active' | 'expired';
}

export interface CartReservation<TCake> {
  version: number;
  server_time: string;
  items: ReservedCartItem<TCake>[];
}

export interface ReservationResult<TCake> {
  success: boolean;
  statusCode?: number;
  error?: string;
  cart: CartReservation<TCake>;
}
