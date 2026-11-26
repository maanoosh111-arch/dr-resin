export const OperationType = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
});

let firebaseCtxPromise = null;

async function getFirebaseContext() {
  if (!firebaseCtxPromise) {
    firebaseCtxPromise = (async () => {
      const [appMod, authMod, firestoreMod, cfgRes] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js'),
        fetch('/firebase-applet-config.json'),
      ]);
      if (!cfgRes.ok) {
        throw new Error('Failed to load firebase-applet-config.json');
      }
      const firebaseConfig = await cfgRes.json();
      const app = appMod.initializeApp(firebaseConfig);
      const db = firestoreMod.getFirestore(app, firebaseConfig.firestoreDatabaseId);
      const auth = authMod.getAuth(app);
      const googleAuthProvider = new authMod.GoogleAuthProvider();
      return {
        app,
        db,
        auth,
        googleAuthProvider,
        signInWithPopup: authMod.signInWithPopup,
        onAuthStateChanged: authMod.onAuthStateChanged,
        collection: firestoreMod.collection,
        doc: firestoreMod.doc,
        getDoc: firestoreMod.getDoc,
        getDocs: firestoreMod.getDocs,
        getDocFromServer: firestoreMod.getDocFromServer,
        setDoc: firestoreMod.setDoc,
        updateDoc: firestoreMod.updateDoc,
        onSnapshot: firestoreMod.onSnapshot,
      };
    })();
  }
  return firebaseCtxPromise;
}

export function handleFirestoreError(error, operationType, path, authInstance = null) {
  const user = authInstance?.currentUser || null;
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: user?.uid,
      email: user?.email,
      emailVerified: user?.emailVerified,
      isAnonymous: user?.isAnonymous,
      tenantId: user?.tenantId,
      providerInfo: Array.isArray(user?.providerData)
        ? user.providerData.map((provider) => ({
            providerId: provider.providerId,
            email: provider.email,
          }))
        : [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  try {
    const { db, doc, getDocFromServer } = await getFirebaseContext();
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export async function getCurrentFirebaseUserEmail() {
  try {
    const { auth } = await getFirebaseContext();
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    return auth.currentUser?.emailVerified ? auth.currentUser.email || null : null;
  } catch {
    return null;
  }
}

export async function isFirebaseVerifiedUser() {
  try {
    const { auth } = await getFirebaseContext();
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    return Boolean(auth.currentUser?.emailVerified);
  } catch {
    return false;
  }
}

export async function onFirebaseAuthChanged(callback) {
  try {
    const { auth, onAuthStateChanged } = await getFirebaseContext();
    return onAuthStateChanged(auth, (user) => {
      callback(user && user.emailVerified ? user.email || null : null);
    });
  } catch {
    return () => undefined;
  }
}

export async function signInChefWithGoogle() {
  const { auth, googleAuthProvider, signInWithPopup } = await getFirebaseContext();
  return signInWithPopup(auth, googleAuthProvider);
}

function normalizeStoreSettingsDoc(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    isOpen: typeof data.isOpen === 'boolean' ? data.isOpen : true,
    openTime: String(data.openTime || '10:00 AM').slice(0, 32),
    closeTime: String(data.closeTime || '11:00 PM').slice(0, 32),
    customNote: String(data.customNote || '').slice(0, 500),
    deliveryFee: Number.isFinite(Number(data.deliveryFee)) ? Number(data.deliveryFee) : 15,
    heroEyebrow: typeof data.heroEyebrow === 'string' ? data.heroEyebrow.slice(0, 120) : '',
    heroTitle:
      typeof data.heroTitle === 'string' && data.heroTitle.trim()
        ? data.heroTitle.slice(0, 200)
        : 'NATURAL WALNUT & DEEP OCEAN EPOXY RESIN',
    heroSubtitle: typeof data.heroSubtitle === 'string' ? data.heroSubtitle.slice(0, 300) : '',
    updatedAt: String(data.updatedAt || '1970-01-01T00:00:00.000Z'),
  };
}

export async function fetchStoreSettingsFromFirestore() {
  const path = 'storeSettings/public';
  const { auth, db, doc, getDocFromServer, getDoc } = await getFirebaseContext();
  try {
    let snap;
    try {
      snap = await getDocFromServer(doc(db, 'storeSettings', 'public'));
    } catch (serverErr) {
      if (serverErr instanceof Error && serverErr.message.includes('the client is offline')) {
        snap = await getDoc(doc(db, 'storeSettings', 'public'));
      } else {
        throw serverErr;
      }
    }
    return snap.exists() ? normalizeStoreSettingsDoc(snap.data()) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path, auth);
  }
}

export async function subscribeStoreSettingsFromFirestore(onUpdate) {
  const path = 'storeSettings/public';
  const { auth, db, doc, onSnapshot } = await getFirebaseContext();
  return onSnapshot(
    doc(db, 'storeSettings', 'public'),
    (snap) => {
      if (snap.exists()) {
        const normalized = normalizeStoreSettingsDoc(snap.data());
        if (normalized) onUpdate(normalized);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path, auth);
    }
  );
}

export async function syncSettingsToFirestore(settings) {
  const { auth, db, doc, setDoc } = await getFirebaseContext();
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }
  if (!auth.currentUser || !auth.currentUser.emailVerified) return false;
  const path = 'storeSettings/public';
  try {
    const openTime = String(settings.openTime || '').trim().slice(0, 32) || '10:00 AM';
    const closeTime = String(settings.closeTime || '').trim().slice(0, 32) || '11:00 PM';
    const feeNum = Number(settings.deliveryFee);
    await setDoc(doc(db, 'storeSettings', 'public'), {
      isOpen: Boolean(settings.isOpen),
      openTime,
      closeTime,
      customNote: String(settings.customNote || '').slice(0, 500),
      deliveryFee: Number.isFinite(feeNum) && feeNum >= 0 ? Number(feeNum.toFixed(2)) : 0,
      heroEyebrow: String(settings.heroEyebrow || '').slice(0, 120),
      heroTitle: String(settings.heroTitle || '').slice(0, 200),
      heroSubtitle: String(settings.heroSubtitle || '').slice(0, 300),
      updatedAt: String(settings.updatedAt || new Date().toISOString()).slice(0, 64),
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, auth);
  }
}

function sanitizeOrderItemsForFirestore(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 50).map((item) => ({
    productId: String(item?.productId || '').slice(0, 64),
    name: String(item?.name || '').slice(0, 160),
    category: String(item?.category || '').slice(0, 100),
    quantity: Math.max(1, Math.min(99, Math.floor(Number(item?.quantity || 1)))),
    unitPrice: Number(item?.unitPrice || 0),
    lineTotal: Number(item?.lineTotal || 0),
    unitProfitSnapshot: Number(item?.unitProfitSnapshot || 0),
    image: String(item?.image || '').slice(0, 500),
  }));
}

export async function fetchOrdersFromFirestore() {
  const { auth, db, collection, getDocs } = await getFirebaseContext();
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }
  if (!auth.currentUser || !auth.currentUser.emailVerified) return [];
  const path = 'orders';
  try {
    const snap = await getDocs(collection(db, 'orders'));
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      items: Array.isArray(d.data().items) ? d.data().items : [],
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path, auth);
  }
}

export async function syncOrderToFirestore(order) {
  const { auth, db, doc, getDoc, setDoc, updateDoc } = await getFirebaseContext();
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }
  if (!auth.currentUser || !auth.currentUser.emailVerified) return false;
  const path = `orders/${order.id}`;
  const orderRef = doc(db, 'orders', order.id);
  try {
    const existingSnap = await getDoc(orderRef);
    if (!existingSnap.exists()) {
      await setDoc(orderRef, {
        orderCode: String(order.orderCode).slice(0, 32),
        customerName: String(order.customerName).slice(0, 120),
        customerPhone: String(order.customerPhone).slice(0, 32),
        deliveryAddress: String(order.deliveryAddress).slice(0, 400),
        deliveryNotes: String(order.deliveryNotes || '').slice(0, 400),
        paymentMethod: String(order.paymentMethod || 'Pay on Delivery').slice(0, 64),
        senderWalletPhone: String(order.senderWalletPhone || '').slice(0, 32),
        items: sanitizeOrderItemsForFirestore(order.items),
        subtotal: Number(order.subtotal || 0),
        deliveryFee: Number(order.deliveryFee || 0),
        grandTotal: Number(order.grandTotal || 0),
        totalProfit: Number(order.totalProfit ?? 0),
        status: order.status || 'Pending',
        rejectionReason: String(order.rejectionReason || '').slice(0, 400),
        isPaid: Boolean(order.isPaid),
        isArchived: Boolean(order.isArchived),
        isDeletedFromArchive: Boolean(order.isDeletedFromArchive),
        createdAt: String(order.createdAt).slice(0, 64),
        updatedAt: String(order.updatedAt || new Date().toISOString()).slice(0, 64),
        ...(order.completedAt ? { completedAt: String(order.completedAt).slice(0, 64) } : {}),
      });
    } else {
      await updateDoc(orderRef, {
        status: order.status || 'Pending',
        rejectionReason: String(order.rejectionReason || '').slice(0, 400),
        isPaid: Boolean(order.isPaid),
        isArchived: Boolean(order.isArchived),
        isDeletedFromArchive: Boolean(order.isDeletedFromArchive),
        updatedAt: String(order.updatedAt || new Date().toISOString()).slice(0, 64),
        ...(order.completedAt ? { completedAt: String(order.completedAt).slice(0, 64) } : {}),
      });
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, auth);
  }
}

export async function fetchChefMetaFromFirestore() {
  const { auth, db, doc, getDocFromServer } = await getFirebaseContext();
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }
  if (!auth.currentUser || !auth.currentUser.emailVerified) return null;
  const path = 'chefMeta/analytics';
  try {
    const snap = await getDocFromServer(doc(db, 'chefMeta', 'analytics'));
    return snap.exists() ? snap.data() : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path, auth);
  }
}

export async function syncAnalyticsBaselineToFirestore(analyticsBaselineAt) {
  const { auth, db, doc, setDoc } = await getFirebaseContext();
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }
  if (!auth.currentUser || !auth.currentUser.emailVerified) return false;
  const path = 'chefMeta/analytics';
  try {
    await setDoc(doc(db, 'chefMeta', 'analytics'), {
      analyticsBaselineAt: String(analyticsBaselineAt || '').slice(0, 64),
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, auth);
  }
}
