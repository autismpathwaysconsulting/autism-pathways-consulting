export function onRequestGet() {
  return Response.json({ status: "protected-synthetic-preview", productionEnabled: false, realClientDataEnabled: false });
}
