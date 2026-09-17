import { doc, runTransaction } from "firebase/firestore";
import { db } from "../firebaseConfig";

const COUNTER_PATH = ["orderCounters", "global"];
const START_NUMBER = 1001;

export async function reserveOrderNumber() {
  const counterRef = doc(db, ...COUNTER_PATH);
  return runTransaction(db, async transaction => {
    const snap = await transaction.get(counterRef);
    const current = snap.exists() ? Number(snap.data().nextOrderNumber) : START_NUMBER;
    const number = Number.isFinite(current) && current >= START_NUMBER ? Math.floor(current) : START_NUMBER;
    transaction.set(counterRef, { nextOrderNumber: number + 1 }, { merge: true });
    return number;
  });
}
