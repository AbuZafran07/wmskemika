import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchProducts from "./tools/search-products";
import listSalesOrders from "./tools/list-sales-orders";
import listPlanOrders from "./tools/list-plan-orders";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "warehouse-management-inventory",
  title: "Warehouse Management Inventory",
  version: "0.1.0",
  instructions:
    "Read-only tools for the PT. Kemika Karya Pratama WMS. Use `search_products` for stock levels, `list_sales_orders` for outbound orders, and `list_plan_orders` for inbound orders. Data access follows the signed-in user's role.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchProducts, listSalesOrders, listPlanOrders],
});
