export function getGdriveBackupResult(value: Record<string, unknown>, runId: string) {
  // Old errors and completions must never resolve the current attempt.
  if (value.last_backup_run_id !== runId) return 'pending';
  if (value.last_backup_status === 'failed') return 'failed';
  if (value.last_backup_status === 'success') return 'success';
  return 'pending';
}