export function backupRunStatus<T extends Record<string, unknown>>(
  config: T,
  runId: string,
  status: 'running' | 'success' | 'failed',
  error?: string,
) {
  return {
    ...config,
    last_backup_run_id: runId,
    last_backup_status: status,
    last_error: status === 'failed' ? (error || 'Backup Google Drive gagal').slice(0, 500) : null,
    ...(status === 'running' ? { last_backup_started_at: new Date().toISOString(), failed_tables: [] } : {}),
  };
}