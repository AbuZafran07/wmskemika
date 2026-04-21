import { z } from 'zod';

// Common validation helpers
const uuidSchema = z.string().uuid('Invalid ID format');
const optionalUuid = z.string().uuid('Invalid ID format').nullable().optional();
const positiveNumber = z.number().positive('Must be a positive number');
const nonNegativeNumber = z.number().nonnegative('Cannot be negative');
const positiveInt = z.number().int().positive('Must be a positive whole number');
const nonNegativeInt = z.number().int().nonnegative('Cannot be negative');

// String sanitization helper
const sanitizedString = (maxLength: number = 255) => 
  z.string()
    .trim()
    .max(maxLength, `Cannot exceed ${maxLength} characters`);

const requiredString = (fieldName: string, maxLength: number = 255) =>
  z.string()
    .trim()
    .min(1, `${fieldName} is required`)
    .max(maxLength, `${fieldName} cannot exceed ${maxLength} characters`);

// Email validation
const emailSchema = z.string().trim().email('Invalid email format').max(255).nullable().optional();

// Phone validation (basic - allows international formats)
const phoneSchema = z.string()
  .trim()
  .max(20, 'Phone number too long')
  .regex(/^[+]?[\d\s()-]*$/, 'Invalid phone format')
  .nullable()
  .optional()
  .transform(val => val === '' ? null : val);

// Date validation
const dateStringSchema = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  'Invalid date format'
);

const optionalDateString = z.string()
  .refine((val) => !val || !isNaN(Date.parse(val)), 'Invalid date format')
  .nullable()
  .optional()
  .transform(val => val === '' ? null : val);

// ==================== Plan Order Schemas ====================

export const planOrderHeaderSchema = z.object({
  plan_number: requiredString('Plan number', 50),
  plan_date: dateStringSchema,
  supplier_id: uuidSchema,
  expected_delivery_date: optionalDateString,
  reference_no: sanitizedString(100).nullable().optional().transform(val => val === '' ? null : val),
  notes: sanitizedString(1000).nullable().optional().transform(val => val === '' ? null : val),
  po_document_url: z.string().nullable().optional().transform(val => val === '' ? null : val),
  status: z.enum(['draft', 'pending', 'approved', 'rejected', 'completed', 'partially_received', 'received', 'cancelled']).default('draft'),
  total_amount: nonNegativeNumber.default(0),
  discount: nonNegativeNumber.default(0),
  tax_rate: nonNegativeNumber.max(100, 'Tax rate cannot exceed 100%').default(0),
  shipping_cost: nonNegativeNumber.default(0),
  grand_total: nonNegativeNumber.default(0),
  created_by: z.string().nullable().optional(),
  approved_by: z.string().nullable().optional(),
  approved_at: z.string().nullable().optional(),
});

export const planOrderItemSchema = z.object({
  product_id: uuidSchema,
  unit_price: nonNegativeNumber,
  planned_qty: positiveInt,
  notes: sanitizedString(500).nullable().optional().transform(val => val === '' ? null : val),
});

export const planOrderItemsArraySchema = z.array(planOrderItemSchema).min(1, 'At least one item is required');

// ==================== Sales Order Schemas ====================

export const salesOrderHeaderSchema = z.object({
  sales_order_number: requiredString('Sales order number', 50),
  order_date: dateStringSchema,
  customer_id: uuidSchema,
  customer_po_number: requiredString('Customer PO number', 50),
  sales_pulse_reference_number: sanitizedString(50).nullable().optional().transform(val => val === '' ? null : val),
  sales_name: requiredString('Sales name', 100),
  allocation_type: requiredString('Allocation type', 50),
  project_instansi: requiredString('Project/Instansi', 200),
  delivery_deadline: dateStringSchema,
  ship_to_address: sanitizedString(500).nullable().optional().transform(val => val === '' ? null : val),
  notes: sanitizedString(1000).nullable().optional().transform(val => val === '' ? null : val),
  po_document_url: z.string().url().nullable().optional().or(z.literal('')).transform(val => val === '' ? null : val),
  status: z.enum(['draft', 'pending', 'approved', 'rejected', 'processing', 'completed']).default('draft'),
  total_amount: nonNegativeNumber.default(0),
  discount: nonNegativeNumber.default(0),
  tax_rate: nonNegativeNumber.max(100, 'Tax rate cannot exceed 100%').default(0),
  shipping_cost: nonNegativeNumber.default(0),
  grand_total: nonNegativeNumber.default(0),
});

export const salesOrderItemSchema = z.object({
  product_id: uuidSchema,
  unit_price: nonNegativeNumber,
  ordered_qty: positiveInt,
  discount: nonNegativeNumber.optional().default(0),
  tax_rate: nonNegativeNumber.max(100).optional().default(0),
  notes: sanitizedString(500).nullable().optional().transform(val => val === '' ? null : val),
});

export const salesOrderItemsArraySchema = z.array(salesOrderItemSchema).min(1, 'At least one item is required');

// ==================== Product Schemas ====================

export const productSchema = z.object({
  sku: sanitizedString(50).nullable().optional().transform(val => val === '' ? null : val),
  barcode: sanitizedString(50).nullable().optional(),
  name: requiredString('Product name', 200),
  category_id: uuidSchema,
  unit_id: uuidSchema,
  supplier_id: uuidSchema,
  purchase_price: nonNegativeNumber,
  selling_price: nonNegativeNumber.nullable().optional(),
  min_stock: nonNegativeInt.default(0),
  max_stock: positiveInt.nullable().optional(),
  location_rack: sanitizedString(50).nullable().optional().transform(val => val === '' ? null : val),
  is_active: z.boolean().default(true),
  photo_url: z.string().url().nullable().optional().or(z.literal('')).transform(val => val === '' ? null : val),
});

// ==================== Customer Schemas ====================

export const customerSchema = z.object({
  code: requiredString('Code', 20).transform(val => val.toUpperCase()),
  name: requiredString('Name', 200),
  customer_type: sanitizedString(50).nullable().optional().transform(val => val === '' ? null : val),
  pic: sanitizedString(100).nullable().optional().transform(val => val === '' ? null : val),
  jabatan: sanitizedString(100).nullable().optional().transform(val => val === '' ? null : val),
  phone: phoneSchema,
  email: emailSchema.transform(val => val === '' ? null : val),
  npwp: sanitizedString(30).nullable().optional().transform(val => val === '' ? null : val),
  terms_payment: sanitizedString(50).nullable().optional().transform(val => val === '' ? null : val),
  address: sanitizedString(500).nullable().optional().transform(val => val === '' ? null : val),
  city: sanitizedString(100).nullable().optional().transform(val => val === '' ? null : val),
  is_active: z.boolean().default(true),
});

// ==================== Supplier Schemas ====================

export const supplierSchema = z.object({
  code: requiredString('Code', 20).transform(val => val.toUpperCase()),
  name: requiredString('Name', 200),
  contact_person: sanitizedString(100).nullable().optional().transform(val => val === '' ? null : val),
  phone: phoneSchema,
  email: emailSchema.transform(val => val === '' ? null : val),
  npwp: sanitizedString(30).nullable().optional().transform(val => val === '' ? null : val),
  terms_payment: sanitizedString(50).nullable().optional().transform(val => val === '' ? null : val),
  address: sanitizedString(500).nullable().optional().transform(val => val === '' ? null : val),
  city: sanitizedString(100).nullable().optional().transform(val => val === '' ? null : val),
  is_active: z.boolean().default(true),
});

// ==================== Category Schema ====================

export const categorySchema = z.object({
  code: requiredString('Code', 20).transform(val => val.toUpperCase()),
  name: requiredString('Name', 100),
  description: sanitizedString(500).nullable().optional().transform(val => val === '' ? null : val),
  is_active: z.boolean().default(true),
});

// ==================== Unit Schema ====================

export const unitSchema = z.object({
  code: requiredString('Code', 10).transform(val => val.toUpperCase()),
  name: requiredString('Name', 50),
  description: sanitizedString(200).nullable().optional().transform(val => val === '' ? null : val),
  is_active: z.boolean().default(true),
});

// ==================== Status Update Schema ====================

export const statusUpdateSchema = z.object({
  id: uuidSchema,
  status: z.string().min(1, 'Status is required'),
  approved_by: optionalUuid,
});

// ==================== Validation helper function ====================

type ValidationSuccess<T> = { success: true; data: T };
type ValidationError = { success: false; errors: string[] };
type ValidationResult<T> = ValidationSuccess<T> | ValidationError;

export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.issues.map(issue => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  
  return { success: false, errors };
}

// Export types
export type PlanOrderHeader = z.infer<typeof planOrderHeaderSchema>;
export type PlanOrderItem = z.infer<typeof planOrderItemSchema>;
export type SalesOrderHeader = z.infer<typeof salesOrderHeaderSchema>;
export type SalesOrderItem = z.infer<typeof salesOrderItemSchema>;
export type ProductData = z.infer<typeof productSchema>;
export type CustomerData = z.infer<typeof customerSchema>;
export type SupplierData = z.infer<typeof supplierSchema>;
export type CategoryData = z.infer<typeof categorySchema>;
export type UnitData = z.infer<typeof unitSchema>;
