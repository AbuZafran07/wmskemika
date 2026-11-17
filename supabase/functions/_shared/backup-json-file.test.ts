import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeBackupJsonFile } from './backup-json-file.ts';
import type { BackupTable } from './backup-tables.ts';

test('streamed archive is valid JSON with separate data and metadata objects', async () => {
  const originalDeno = globalThis.Deno;
  const originalFetch = globalThis.fetch;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-json-test-'));
  const fileDescriptors = new Map<string, number>();
  let sequence = 0;
  globalThis.Deno = {
    env: { get: () => 'test' },
    open: async (filePath: string) => {
      const actualPath = filePath.replace('/tmp/', `${directory}${path.sep}`);
      const fd = fs.openSync(actualPath, 'w+');
      fileDescriptors.set(filePath, fd);
      return {
        write: async (chunk: Uint8Array) => fs.writeSync(fd, chunk),
        sync: () => fs.fsyncSync(fd),
        close: () => fs.closeSync(fd),
      };
    },
    stat: async (filePath: string) => {
      const actualPath = filePath.replace('/tmp/', `${directory}${path.sep}`);
      return { size: fs.statSync(actualPath).size };
    },
    remove: async (filePath: string) => fs.unlinkSync(filePath.replace('/tmp/', `${directory}${path.sep}`)),
  } as never;
  globalThis.fetch = async () => new Response(JSON.stringify([{ id: 1, value: 'first' }, { id: 2, value: 'second' }]), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Content-Range': '0-1/2' },
  });

  try {
    const table: BackupTable = { table_name: 'user_signatures', primary_key: 'id' };
    const archive = await writeBackupJsonFile(
      null as never,
      [table],
      () => ({}),
      (counts, total) => ({ tables: [table.table_name], table_counts: counts, total_records: total }),
    );
    const actualPath = archive.path.replace('/tmp/', `${directory}${path.sep}`);
    const parsed = JSON.parse(fs.readFileSync(actualPath, 'utf8'));
    assert.equal(parsed.data.user_signatures.length, 2);
    assert.equal(parsed.data.user_signatures[1].value, 'second');
    assert.equal(parsed._meta.total_records, 2);
    assert.equal(parsed._meta.table_counts.user_signatures, 2);
    await archive.cleanup();
  } finally {
    globalThis.Deno = originalDeno;
    globalThis.fetch = originalFetch;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
