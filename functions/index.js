const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

function kitchenProjection(id, order) {
  return {
    orderId: id,
    orderNumber: order.orderNumber || id.slice(-6).toUpperCase(),
    orderType: order.orderType || "takeaway",
    tableNumber: order.tableNumber || null,
    items: (order.items || []).map((item) => ({
      id: item.id || null,
      name: item.name || "Item",
      quantity: Math.max(1, Number(item.quantity) || 1),
      options: item.options || null,
    })),
    specialInstructions: order.specialInstructions || "",
    orderStatus: order.orderStatus || "Received",
    createdAt: order.createdAt || order.timestamp || FieldValue.serverTimestamp(),
    updatedAt: order.updatedAt || FieldValue.serverTimestamp(),
  };
}

exports.syncKitchenOrder = onDocumentCreated("orders/{orderId}", async (event) => {
  const order = event.data?.data();
  if (!order) return;
  await db.collection("kitchenOrders").doc(event.params.orderId).set(kitchenProjection(event.params.orderId, order));
});

exports.syncKitchenOrderUpdate = onDocumentUpdated("orders/{orderId}", async (event) => {
  const after = event.data?.after?.data();
  if (!after) return;
  const ref = db.collection("kitchenOrders").doc(event.params.orderId);
  const kitchenStatuses = ["Received", "Pending", "Accepted", "Preparing", "Ready", "Ready for Pickup"];
  if (!kitchenStatuses.includes(after.orderStatus || after.status)) {
    await ref.delete().catch(() => {});
    return;
  }
  await ref.set(kitchenProjection(event.params.orderId, after), { merge: true });
});
