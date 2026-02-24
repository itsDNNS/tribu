# Backup and Restore

## Prerequisites

- Docker and Docker Compose are installed and running
- Tribu containers are managed via `infra/docker-compose.yml`

## Creating a Backup

Run from the repository root:

```bash
./scripts/backup.sh
```

To write the archive to a specific directory (e.g. a mounted NAS share):

```bash
./scripts/backup.sh --output-dir /mnt/nas/backups/tribu
```

This creates a `tribu-backup-YYYY-MM-DD-HHMMSS.tar.gz` archive containing:
- `database.dump` -- full PostgreSQL dump (custom format)
- `metadata.json` -- backup version, Alembic revision, PG version, timestamp

Example output:
```
Creating Tribu backup...
  Dumping database...
  Packing archive...

Backup complete!
  Archive: tribu-backup-2026-02-24-143022.tar.gz
  Size:    1.2M
  Alembic: 0005
  PG:      16.2
```

## Restoring on a Fresh Server

1. Clone the repository and configure your environment:
   ```bash
   git clone https://github.com/itsDNNS/tribu.git
   cd tribu/infra
   cp .env.example .env
   # Edit .env -- set POSTGRES_PASSWORD and JWT_SECRET
   ```

2. Copy the backup archive to the server.

3. Run the restore script:
   ```bash
   ./scripts/restore.sh path/to/tribu-backup-2026-02-24-143022.tar.gz
   ```

4. The script will show backup metadata and ask for confirmation before proceeding.

## Important Notes

- **Secrets are NOT included in backups.** You must configure `.env` manually on the target server (`POSTGRES_PASSWORD`, `JWT_SECRET`).
- **Changing `JWT_SECRET`** invalidates all existing sessions and tokens. Users will need to log in again.
- **Redis is not backed up** because it only holds ephemeral session/cache data.
- The backup uses PostgreSQL's custom dump format (`pg_dump -Fc`), which supports selective and parallel restore.

## Backup via UI

Admins can manage backups directly from the Admin panel in the web interface.

### Schedule

Open Admin > Backups and choose a schedule:

| Preset   | When                    |
|----------|-------------------------|
| Off      | No automatic backups    |
| Daily    | Every day at 03:00      |
| Weekly   | Every Sunday at 03:00   |
| Monthly  | 1st of each month 03:00 |

Set the **retention** count to control how many backups are kept (oldest are deleted automatically).

### Manual Backup

Click **Create backup** to trigger an immediate backup. The archive appears in the list and can be downloaded directly from the browser.

### External Storage

By default backups are stored in a Docker volume (`tribu_backups`). To store backups on a NAS or external drive, replace the volume mount in `infra/docker-compose.yml`:

```yaml
volumes:
  # - tribu_backups:/backups
  - /mnt/nas/backups/tribu:/backups
```

The CLI scripts (`scripts/backup.sh`, `scripts/restore.sh`) continue to work independently of the UI.
