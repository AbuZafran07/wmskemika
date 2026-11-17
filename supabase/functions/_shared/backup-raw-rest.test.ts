import test from 'node:test';
import assert from 'node:assert/strict';
import { rawTablePages } from './backup-raw-rest.ts';
import type { BackupTable } from './backup-tables.ts';

test('raw REST pages preserve JSON and continue beyond 1,000 rows', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const rows = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1, value: `row-${index + 1}` }));
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    const parsed = new URL(url);
    if (parsed.searchParams.get('select') === 'id') {
      return new Response(JSON.stringify([{ id: 1000 }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const secondPage = parsed.searchParams.get('id') === 'gt.1000';
    const pageRows = secondPage ? rows.slice(1000) : rows.slice(0, 1000);
    return new Response(JSON.stringify(pageRows), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Range': secondPage ? '0-0/1' : '0-999/1001',
      },
    });
  };

  try {
    const table: BackupTable = { table_name: 'stock_transactions', primary_key: 'id' };
    const pages = [];
    for await (const page of rawTablePages(table, { pageSize: 1000 }, 'https://example.test', 'test-key')) {
      pages.push(page);
    }
    assert.equal(pages.length, 2);
    assert.deepEqual(pages.map((page) => page.rowCount), [1000, 1]);
    assert.equal(pages[0].lastKey, 1000);
    const combined = JSON.parse(`[${pages.map((page) => page.json.slice(1, -1)).join(',')}]`);
    assert.equal(combined.length, 1001);
    assert.equal(combined[1000].id, 1001);
    assert.ok(requestedUrls.some((url) => decodeURIComponent(url).includes('id=gt.1000')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
