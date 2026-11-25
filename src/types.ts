export enum OrderStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'In Progress',
  FINISHED = 'Finished',
  REJECTED = 'Rejected',
}

export enum PaymentMethod {
  VODAFONE_CASH = 'Vodafone Cash',
  INSTAPAY = 'InstaPay',
  ORANGE_CASH = 'Orange Cash',
  ETISALAT_CASH = 'Etisalat Cash',
  COD = 'Cash on Delivery',
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  description: string;
  primaryImage: string;
  extraImages: string[];
  images: string[];
}

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  unitPrice: number;
  quantity: number;
  image: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  unitProfitSnapshot?: number;
  image?: string;
}

export interface Order {
  id: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryNotes: string;
  paymentMethod: PaymentMethod | string;
  senderWalletPhone: string;
  receiptImageDataUrl: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  grandTotal: number;
  totalProfit?: number;
  status: OrderStatus | string;
  rejectionReason: string;
  isPaid: boolean;
  isArchived: boolean;
  isDeletedFromArchive: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface StoreSettings {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  customNote: string;
  deliveryFee: number;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  supportPhone: string;
  currency: string;
  brandName: string;
  updatedAt: string;
}
