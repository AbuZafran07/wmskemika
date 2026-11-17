import test from 'node:test';
import assert from 'node:assert/strict';
import { readAllTableRows, readTableInParts, type BackupTable } from './backup-tables.ts';

class FakeQuery {
  private after: number | null = null;
  private pageSize = 1000;
  constructor(private readonly rows: Array<{ id: number; value: string }>, private readonly failure = false) {}
  select() { return this; }
  order() { return this; }
  limit(value: number) { this.pageSize = value; return this; }
  gte() { return this; }
  gt(_column: string, value: number) { this.after = value; return this; }
  then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
    const result = this.failure
      ? { data: null, error: { message: 'simulated read failure' } }
      : {
          data: this.rows.filter((row) => this.after === null || row.id > this.after).slice(0, this.pageSize),
          error: null,
        };
    return Promise.resolve(result).then(resolve, reject);
  }
}

function fakeClient(rows: Array<{ id: number; value: string }>, failure = false) {
  return { from: () => new FakeQuery(rows, failure) } as never;
}

const table: BackupTable = { table_name: 'stock_transactions', primary_key: 'id' };
const rows = Array.from({ length: 2505 }, (_, index) => ({ id: index + 1, value: `row-${index + 1}` }));

test('keyset pagination returns every row beyond the 1,000-row API limit', async () => {
  const result = await readAllTableRows(fakeClient(rows), table);
  assert.equal(result.length, 2505);
  assert.equal(result[0].id, 1);
  assert.equal(result[2504].id, 2505);
});

test('external parts contain at most 5,000 rows without losing the remainder', async () => {
  const largeRows = Array.from({ length: 12_001 }, (_, index) => ({ id: index + 1, value: `row-${index + 1}` }));
  const partSizes: number[] = [];
  let firstId = 0;
  let lastId = 0;
  const result = await readTableInParts(fakeClient(largeRows), table, {}, 5000, async (_part, partRows) => {
    partSizes.push(partRows.length);
    if (partSizes.length === 1) firstId = Number(partRows[0].id);
    lastId = Number(partRows[partRows.length - 1].id);
  });
  assert.equal(result.rowCount, 12_001);
  assert.equal(result.partCount, 3);
  assert.deepEqual(partSizes, [5000, 5000, 2001]);
  assert.equal(firstId, 1);
  assert.equal(lastId, 12_001);
});

test('a table read error fails the backup instead of being skipped', async () => {
  await assert.rejects(
    () => readAllTableRows(fakeClient(rows, true), table),
    /Backup tabel stock_transactions gagal: simulated read failure/,
  );
});
