import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../../config/firebase';

const CANCELLED_MONEY_DOC_ID = 'main';
const COLLECTION_NAME = 'cancelledMoney';

export const cancelledMoneyService = {
  async subtract(amount: number): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, CANCELLED_MONEY_DOC_ID);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      await updateDoc(docRef, {
        value: increment(-amount),
        updatedAt: new Date().toISOString()
      });
    } else {
      await setDoc(docRef, {
        value: -amount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  },
  async getValue(): Promise<number> {
    const docRef = doc(db, COLLECTION_NAME, CANCELLED_MONEY_DOC_ID);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return typeof data.value === 'number' ? data.value : 0;
    }
    return 0;
  }
};
