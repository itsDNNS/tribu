import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import BackupSection from '../../components/admin/BackupSection';

let mockAppState = {};
const toastError = jest.fn();

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ error: toastError }),
}));

jest.mock('../../components/ConfirmDialog', () => ({ onConfirm }) => (
  <div role="dialog">
    Confirm dialog
    <button type="button" onClick={onConfirm}>Confirm delete</button>
  </div>
));

jest.mock('../../lib/helpers', () => ({
  downloadBlob: jest.fn(),
  errorText: (_detail, fallback) => fallback,
}));

jest.mock('../../lib/api', () => ({
  apiGetBackupConfig: jest.fn(),
  apiGetBackupStatus: jest.fn(),
  apiGetBackups: jest.fn(),
  apiUpdateBackupConfig: jest.fn(),
  apiTriggerBackup: jest.fn(),
  apiDownloadBackup: jest.fn(),
  apiDeleteBackup: jest.fn(),
}));

const api = require('../../lib/api');

const backupEntry = {
  filename: 'tribu-backup-2026-04-29-090000.tar.gz',
  created_at: '2026-04-29T09:00:00Z',
  size_bytes: 2048,
  alembic_revision: '0039',
};

const backupStatusEntry = {
  filename: backupEntry.filename,
  created_at: backupEntry.created_at,
  size_bytes: backupEntry.size_bytes,
};

const messages = {
  backup_title: 'Backups',
  backup_schedule: 'Schedule',
  backup_schedule_off: 'Off',
  backup_schedule_daily: 'Daily',
  backup_schedule_weekly: 'Weekly',
  backup_schedule_monthly: 'Monthly',
  backup_retention: 'Keep backups',
  backup_retention_hint: 'Maximum number of backups to keep',
  backup_save: 'Save',
  backup_now: 'Create backup',
  backup_creating: 'Creating backup...',
  backup_list: 'Backups',
  backup_no_backups: 'No backups yet.',
  backup_download: 'Download',
  backup_delete: 'Delete',
  backup_delete_confirm: 'Really delete this backup?',
  backup_last: 'Last backup',
  backup_volume_hint: 'Backups are stored in the configured backup volume. Use external storage for safer retention.',
  backup_confidence_title: 'Backup confidence',
  backup_confidence_empty: 'No export has been created yet.',
  backup_database_backend: 'Database backend',
  backup_latest_export: 'Latest export',
  backup_included_domains: 'Included data',
  backup_excluded_domains: 'Not included',
  backup_restore_guidance: 'Restore guidance',
  backup_restore_setup_wizard: 'Restore during the setup wizard on a fresh installation.',
  backup_restore_unknown: 'Follow the documented restore runbook.',
  backup_docs_link: 'Open backup docs',
  backup_status_unavailable: 'Backup status is temporarily unavailable.',
  backup_database_postgresql: 'PostgreSQL',
  backup_database_sqlite: 'SQLite',
  backup_database_unknown: 'Unknown database',
  backup_storage_configured_backup_volume: 'Configured backup volume',
  backup_storage_unknown: 'Configured backup storage',
  backup_domain_calendar: 'Calendar',
  backup_domain_tasks: 'Tasks',
  backup_domain_contacts: 'Contacts',
  backup_domain_unknown: 'Other household data',
  backup_excluded_jwt_secret: 'JWT secret',
  backup_excluded_reverse_proxy_configuration: 'Reverse proxy configuration',
  backup_excluded_unknown: 'Other deployment data',
  toast: { error: 'Error' },
};

function setupMocks(overrides = {}) {
  api.apiGetBackupConfig.mockResolvedValue({ ok: true, data: { schedule: 'off', retention: 7, last_backup: null, last_backup_status: null } });
  api.apiGetBackups.mockResolvedValue({ ok: true, data: [] });
  api.apiGetBackupStatus.mockResolvedValue({
    ok: true,
    data: {
      database_backend: 'postgresql',
      backup_dir: 'configured_backup_volume',
      has_backups: false,
      latest_backup: null,
      included_domains: ['calendar', 'tasks', 'contacts'],
      excluded_domains: ['jwt_secret', 'reverse_proxy_configuration'],
      restore_supported: 'setup_wizard',
      restore_runbook: 'self_hosting_backup_restore',
      ...overrides,
    },
  });
}

describe('BackupSection confidence panel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState = { messages };
    setupMocks();
  });

  test('explains backend, included domains, missing export warning, and restore path', async () => {
    render(<BackupSection />);

    expect(await screen.findByText('Backup confidence')).toBeInTheDocument();
    expect(await screen.findByText('Database backend')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('Configured backup volume')).toBeInTheDocument();
    expect(screen.getByText('No export has been created yet.')).toBeInTheDocument();
    expect(screen.getByText('Included data')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('Not included')).toBeInTheDocument();
    expect(screen.getByText('JWT secret')).toBeInTheDocument();
    expect(screen.getByText('Restore during the setup wizard on a fresh installation.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open backup docs' })).toHaveAttribute('href', 'https://github.com/itsDNNS/tribu/blob/main/docs/self-hosting.md#backup--restore');
    expect(screen.queryByText(new RegExp('/' + 'backups'))).not.toBeInTheDocument();
    expect(screen.queryByText(/docker-compose\.yml/i)).not.toBeInTheDocument();
  });

  test('shows latest export metadata when a backup exists', async () => {
    setupMocks({
      has_backups: true,
      latest_backup: backupStatusEntry,
    });

    render(<BackupSection />);

    await waitFor(() => expect(screen.getByText('tribu-backup-2026-04-29-090000.tar.gz')).toBeInTheDocument());
    expect(screen.queryByText('No export has been created yet.')).not.toBeInTheDocument();
  });

  test('keeps confidence metadata and updates latest export when status refresh fails after creating a backup', async () => {
    api.apiTriggerBackup.mockResolvedValue({ ok: true, data: {} });
    api.apiGetBackups
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValueOnce({ ok: true, data: [backupEntry] });
    api.apiGetBackupStatus
      .mockResolvedValueOnce({
        ok: true,
        data: {
          database_backend: 'postgresql',
          backup_dir: 'configured_backup_volume',
          has_backups: false,
          latest_backup: null,
          included_domains: ['calendar', 'tasks', 'contacts'],
          excluded_domains: ['jwt_secret', 'reverse_proxy_configuration'],
          restore_supported: 'setup_wizard',
          restore_runbook: 'self_hosting_backup_restore',
        },
      })
      .mockRejectedValueOnce(new Error('status unavailable'));

    render(<BackupSection />);

    expect(await screen.findByText('Backup confidence')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));

    await waitFor(() => expect(api.apiTriggerBackup).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Backup status is temporarily unavailable.')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open backup docs' })).toBeInTheDocument();
    expect(screen.getAllByText('tribu-backup-2026-04-29-090000.tar.gz').length).toBeGreaterThan(0);
    expect(screen.queryByText('No export has been created yet.')).not.toBeInTheDocument();
  });

  test('keeps public-safe confidence metadata when status refresh fails after deleting a backup', async () => {
    api.apiGetBackups
      .mockResolvedValueOnce({ ok: true, data: [backupEntry] })
      .mockResolvedValueOnce({ ok: true, data: [] });
    api.apiDeleteBackup.mockResolvedValue({ ok: true, data: {} });
    api.apiGetBackupStatus
      .mockResolvedValueOnce({
        ok: true,
        data: {
          database_backend: 'postgresql',
          backup_dir: 'configured_backup_volume',
          has_backups: true,
          latest_backup: backupStatusEntry,
          included_domains: ['calendar', 'tasks', 'contacts'],
          excluded_domains: ['jwt_secret', 'reverse_proxy_configuration'],
          restore_supported: 'setup_wizard',
          restore_runbook: 'self_hosting_backup_restore',
        },
      })
      .mockRejectedValueOnce(new Error('status unavailable'));

    render(<BackupSection />);

    await waitFor(() => expect(screen.getAllByText('tribu-backup-2026-04-29-090000.tar.gz').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));

    await waitFor(() => expect(api.apiDeleteBackup).toHaveBeenCalledWith('tribu-backup-2026-04-29-090000.tar.gz'));
    expect(await screen.findByText('Backup status is temporarily unavailable.')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open backup docs' })).toBeInTheDocument();
    expect(screen.getByText('No export has been created yet.')).toBeInTheDocument();
  });

  test('falls back to localized unknown labels instead of rendering raw status codes', async () => {
    setupMocks({
      database_backend: 'future_database',
      backup_dir: 'future_storage',
      included_domains: ['future_domain'],
      excluded_domains: ['future_excluded'],
      restore_supported: 'future_restore',
    });

    render(<BackupSection />);

    expect(await screen.findByText('Unknown database')).toBeInTheDocument();
    expect(screen.getByText('Configured backup storage')).toBeInTheDocument();
    expect(screen.getByText('Other household data')).toBeInTheDocument();
    expect(screen.getByText('Other deployment data')).toBeInTheDocument();
    expect(screen.getByText('Follow the documented restore runbook.')).toBeInTheDocument();
    expect(screen.queryByText('future_database')).not.toBeInTheDocument();
    expect(screen.queryByText('future_domain')).not.toBeInTheDocument();
  });
});
