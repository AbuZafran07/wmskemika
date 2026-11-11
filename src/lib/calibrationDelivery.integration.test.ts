import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';

// Explicit opt-in: exercises and restores an existing completed calibration SO.
test('completed calibration SO closes and can reopen without constraint errors', {
  skip: process.env.CALIBRATION_STATUS_TEST !== '1',
}, async () => {
  const minted = JSON.parse(readFileSync(`${homedir()}/.cache/lovable-auth/session.json`, 'utf8'));
  const ref = minted.storage_key.slice(3, -11);
  const client = createClient(`https://${ref}.supabase.co`, minted.session.access_token, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: authError } = await client.auth.setSession(minted.session);
  strictEqual(authError, null);
  const id = 'd3b6c8d1-9414-415a-8933-f043b1444256';
  const read = async () => {
    const { data, error } = await client.from('sales_order_headers')
      .select('status, calibration_status, order_type').eq('id', id).single();
    strictEqual(error, null);
    ok(data);
    return data;
  };
  const initial = await read();
  strictEqual(initial.order_type, 'calibration');
  strictEqual(initial.status, 'delivered');
  strictEqual(initial.calibration_status, 'delivered');
  try {
    const { error } = await client.rpc('sync_calibration_delivered', { p_so_id: id, p_delivered: false });
    strictEqual(error, null);
    const reopened = await read();
    strictEqual(reopened.status, 'approved');
    strictEqual(reopened.calibration_status, 'in_progress');
  } finally {
    const { error } = await client.rpc('sync_calibration_delivered', { p_so_id: id, p_delivered: true });
    strictEqual(error, null);
  }
  const closed = await read();
  strictEqual(closed.status, 'delivered');
  strictEqual(closed.calibration_status, 'delivered');
});