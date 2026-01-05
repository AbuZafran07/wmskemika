import { supabase } from '@/integrations/supabase/client';

// Generate customer code: CUSTYYYY-NNNN
export async function generateCustomerCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CUST${year}-`;
  
  // Get the last customer code for this year
  const { data, error } = await supabase
    .from('customers')
    .select('code')
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching last customer code:', error);
    return `${prefix}0001`;
  }

  if (!data || data.length === 0) {
    return `${prefix}0001`;
  }

  // Extract the number part and increment
  const lastCode = data[0].code;
  const lastNumber = parseInt(lastCode.replace(prefix, ''), 10);
  const nextNumber = (lastNumber + 1).toString().padStart(4, '0');
  
  return `${prefix}${nextNumber}`;
}

// Generate supplier code: VNDYYYY-NNNN
export async function generateSupplierCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `VND${year}-`;
  
  // Get the last supplier code for this year
  const { data, error } = await supabase
    .from('suppliers')
    .select('code')
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching last supplier code:', error);
    return `${prefix}0001`;
  }

  if (!data || data.length === 0) {
    return `${prefix}0001`;
  }

  // Extract the number part and increment
  const lastCode = data[0].code;
  const lastNumber = parseInt(lastCode.replace(prefix, ''), 10);
  const nextNumber = (lastNumber + 1).toString().padStart(4, '0');
  
  return `${prefix}${nextNumber}`;
}
