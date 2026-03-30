import { supabase } from "@/integrations/supabase/client";

export type TransactionType = 
  | "stockIn"
  | "stockOut"
  | "planOrder"
  | "salesOrder"
  | "stockAdjustment";

interface NumberConfig {
  prefix: string;
}

const configs: Record<TransactionType, NumberConfig> = {
  stockIn: { prefix: "SI" },
  stockOut: { prefix: "DO" },
  planOrder: { prefix: "PO" },
  salesOrder: { prefix: "SO" },
  stockAdjustment: { prefix: "ADJ" },
};

/**
 * Get today's date formatted as YYYYMMDD
 */
function getTodayDateStr(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Generate date prefix for transaction number
 */
export function getDatePrefix(type: TransactionType): string {
  const config = configs[type];
  const dateStr = getTodayDateStr();
  return `${config.prefix}/${dateStr}.`;
}

/**
 * Parse sequence number from transaction number
 */
export function parseSequence(number: string, prefix: string): number {
  const match = number.match(new RegExp(`${prefix.replace("/", "\\/")}(\\d+)`));
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}

/**
 * Format sequence to transaction number
 */
export function formatTransactionNumber(type: TransactionType, sequence: number): string {
  const datePrefix = getDatePrefix(type);
  return `${datePrefix}${String(sequence).padStart(2, "0")}`;
}

// Type-safe duplicate checkers for each transaction type
export async function checkDuplicateStockIn(number: string): Promise<boolean> {
  const { data } = await supabase
    .from("stock_in_headers")
    .select("id")
    .eq("stock_in_number", number)
    .limit(1);
  return (data?.length || 0) > 0;
}

export async function checkDuplicateStockOut(number: string): Promise<boolean> {
  const { data } = await supabase
    .from("stock_out_headers")
    .select("id")
    .eq("stock_out_number", number)
    .limit(1);
  return (data?.length || 0) > 0;
}

export async function checkDuplicatePlanOrder(number: string): Promise<boolean> {
  const { data } = await supabase
    .from("plan_order_headers")
    .select("id")
    .eq("plan_number", number)
    .limit(1);
  return (data?.length || 0) > 0;
}

export async function checkDuplicateSalesOrder(number: string): Promise<boolean> {
  const { data } = await supabase
    .from("sales_order_headers")
    .select("id")
    .eq("sales_order_number", number)
    .limit(1);
  return (data?.length || 0) > 0;
}

export async function checkDuplicateStockAdjustment(number: string): Promise<boolean> {
  const { data } = await supabase
    .from("stock_adjustments")
    .select("id")
    .eq("adjustment_number", number)
    .limit(1);
  return (data?.length || 0) > 0;
}

// Get last number for each transaction type
export async function getLastStockInNumber(prefix: string): Promise<string | null> {
  const { data } = await supabase
    .from("stock_in_headers")
    .select("stock_in_number")
    .like("stock_in_number", `${prefix}%`)
    .order("stock_in_number", { ascending: false })
    .limit(1);
  return data?.[0]?.stock_in_number || null;
}

export async function getLastStockOutNumber(prefix: string): Promise<string | null> {
  const { data } = await supabase
    .from("stock_out_headers")
    .select("stock_out_number")
    .like("stock_out_number", `${prefix}%`)
    .order("stock_out_number", { ascending: false })
    .limit(1);
  return data?.[0]?.stock_out_number || null;
}

export async function getLastPlanOrderNumber(prefix: string): Promise<string | null> {
  const { data } = await supabase
    .from("plan_order_headers")
    .select("plan_number")
    .like("plan_number", `${prefix}%`)
    .order("plan_number", { ascending: false })
    .limit(1);
  return data?.[0]?.plan_number || null;
}

export async function getLastSalesOrderNumber(prefix: string): Promise<string | null> {
  const { data } = await supabase
    .from("sales_order_headers")
    .select("sales_order_number")
    .like("sales_order_number", `${prefix}%`)
    .order("sales_order_number", { ascending: false })
    .limit(1);
  return data?.[0]?.sales_order_number || null;
}

export async function getLastStockAdjustmentNumber(prefix: string): Promise<string | null> {
  const { data } = await supabase
    .from("stock_adjustments")
    .select("adjustment_number")
    .like("adjustment_number", `${prefix}%`)
    .order("adjustment_number", { ascending: false })
    .limit(1);
  return data?.[0]?.adjustment_number || null;
}

/**
 * Generate a unique transaction number with retry mechanism
 */
export async function generateUniqueStockInNumber(maxRetries = 5): Promise<string> {
  const prefix = getDatePrefix("stockIn");
  const lastNumber = await getLastStockInNumber(prefix);
  let sequence = lastNumber ? parseSequence(lastNumber, prefix) + 1 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = formatTransactionNumber("stockIn", sequence + attempt);
    const isDuplicate = await checkDuplicateStockIn(number);
    if (!isDuplicate) return number;
  }

  // Fallback with timestamp
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}

export async function generateUniqueStockOutNumber(maxRetries = 5): Promise<string> {
  const prefix = getDatePrefix("stockOut");
  const lastNumber = await getLastStockOutNumber(prefix);
  let sequence = lastNumber ? parseSequence(lastNumber, prefix) + 1 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = formatTransactionNumber("stockOut", sequence + attempt);
    const isDuplicate = await checkDuplicateStockOut(number);
    if (!isDuplicate) return number;
  }

  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}

export async function generateUniquePlanOrderNumber(maxRetries = 5): Promise<string> {
  const prefix = getDatePrefix("planOrder");
  const lastNumber = await getLastPlanOrderNumber(prefix);
  let sequence = lastNumber ? parseSequence(lastNumber, prefix) + 1 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = formatTransactionNumber("planOrder", sequence + attempt);
    const isDuplicate = await checkDuplicatePlanOrder(number);
    if (!isDuplicate) return number;
  }

  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}

export async function generateUniqueSalesOrderNumber(maxRetries = 5): Promise<string> {
  const prefix = getDatePrefix("salesOrder");
  const lastNumber = await getLastSalesOrderNumber(prefix);
  let sequence = lastNumber ? parseSequence(lastNumber, prefix) + 1 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = formatTransactionNumber("salesOrder", sequence + attempt);
    const isDuplicate = await checkDuplicateSalesOrder(number);
    if (!isDuplicate) return number;
  }

  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}

export async function generateUniqueStockAdjustmentNumber(maxRetries = 5): Promise<string> {
  const prefix = getDatePrefix("stockAdjustment");
  const lastNumber = await getLastStockAdjustmentNumber(prefix);
  let sequence = lastNumber ? parseSequence(lastNumber, prefix) + 1 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = formatTransactionNumber("stockAdjustment", sequence + attempt);
    const isDuplicate = await checkDuplicateStockAdjustment(number);
    if (!isDuplicate) return number;
  }

  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}

/**
 * Generate unique Delivery Order number with format DO/YYYYMMDD.XX
 */
export async function generateUniqueDONumber(maxRetries = 5): Promise<string> {
  const dateStr = getTodayDateStr();
  const prefix = `DO/${dateStr}.`;

  const { data } = await supabase
    .from("delivery_orders")
    .select("do_number")
    .like("do_number", `${prefix}%`)
    .order("do_number", { ascending: false })
    .limit(1);

  const lastNumber = data?.[0]?.do_number || null;
  let sequence = lastNumber ? parseSequence(lastNumber, prefix) + 1 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = `${prefix}${String(sequence + attempt).padStart(2, "0")}`;
    const { data: existing } = await supabase
      .from("delivery_orders")
      .select("id")
      .eq("do_number", number)
      .limit(1);
    if (!existing?.length) return number;
  }

  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}
