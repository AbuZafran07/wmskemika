import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGdriveBackupResult } from './gdriveBackupStatus';
import { backupRunStatus } from '../../supabase/functions/gdrive-backup/run-status';

test('retry ignores the previous failed backup and clears its error before polling', () => {
  const old = { enabled: true, last_backup_run_id: 'old', last_backup_status: 'failed', last_error: 'Old upload failure' };
  assert.equal(getGdriveBackupResult(old, 'retry'), 'pending');
  const running = backupRunStatus(old, 'retry', 'running');
  assert.equal(running.last_error, null);
  assert.equal(running.enabled, true);
  assert.equal(running.last_backup_status, 'running');
  assert.equal(getGdriveBackupResult(running, 'retry'), 'pending');
  assert.equal(getGdriveBackupResult(backupRunStatus(running, 'retry', 'success'), 'retry'), 'success');
});

test('current upload failure terminates polling with its new error', () => {
  const failed = backupRunStatus({}, 'retry', 'failed', 'Sesi Google Drive upload gagal (502)');
  assert.equal(getGdriveBackupResult(failed, 'retry'), 'failed');
  assert.equal(failed.last_error, 'Sesi Google Drive upload gagal (502)');
});

test('an earlier successful backup cannot finish a running retry', () => {
  assert.equal(getGdriveBackupResult({ last_backup_run_id: 'old', last_backup_status: 'success', last_backup_at: '2026-11-20' }, 'retry'), 'pending');
});