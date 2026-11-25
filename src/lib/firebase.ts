import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { Order, StoreSettings } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export async function syncSettingsToFirestore(settings: StoreSettings): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const path = 'storeSettings/public';
  try {
    await setDoc(doc(db, 'storeSettings', 'public'), {
      isOpen: settings.isOpen,
      openTime: settings.openTime,
      closeTime: settings.closeTime,
      customNote: settings.customNote,
      deliveryFee: settings.deliveryFee,
      heroEyebrow: (settings.heroEyebrow || '').slice(0, 120),
      heroTitle: (settings.heroTitle || '').slice(0, 200),
      heroSubtitle: (settings.heroSubtitle || '').slice(0, 300),
      updatedAt: settings.updatedAt || new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncOrderToFirestore(order: Order): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const path = `orders/${order.id}`;
  try {
    await setDoc(doc(db, 'orders', order.id), {
      orderCode: order.orderCode,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      deliveryNotes: order.deliveryNotes || '',
      paymentMethod: order.paymentMethod,
      senderWalletPhone: order.senderWalletPhone || '',
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      grandTotal: order.grandTotal,
      totalProfit: order.totalProfit ?? 0,
      status: order.status,
      rejectionReason: order.rejectionReason || '',
      isPaid: order.isPaid,
      isArchived: order.isArchived,
      isDeletedFromArchive: order.isDeletedFromArchive,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      ...(order.completedAt ? { completedAt: order.completedAt } : {}),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
