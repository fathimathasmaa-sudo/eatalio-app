export function customerContext(search = window.location.search) {
  const params = new URLSearchParams(search);
  return {
    table: params.get("table") || "",
    tableId: params.get("tableId") || "",
    orderType: params.get("orderType") || "",
  };
}

export function customerPath(path, context = customerContext()) {
  const params = new URLSearchParams();
  if (context.table) params.set("table", context.table);
  if (context.tableId) params.set("tableId", context.tableId);
  if (context.orderType) params.set("orderType", context.orderType);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export const customerPaths = (search) => {
  const context = customerContext(search);
  return {
    home: customerPath("/", context),
    menu: customerPath("/menu", context),
    cart: customerPath("/cart", context),
    checkout: customerPath("/checkout", context),
    orders: "/orders",
  };
};
