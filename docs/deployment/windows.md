# Windows host deployment

Run one application process on a dedicated, clinic-managed Windows host. Keep SQLite and temporary import/restore files on a local NTFS volume. Do not place them on an SMB share, mapped network drive, synced folder, or a staff user's profile.

## Protect the application data directory

Use a dedicated service identity and a data folder outside the source checkout. For example, from an elevated PowerShell session:

```powershell
$DataDirectory = 'D:\ClinicData\WeightManagementTracker'
$ServiceIdentity = '.\svc-weight-tracker'
New-Item -ItemType Directory -Force -Path $DataDirectory | Out-Null
icacls $DataDirectory /inheritance:r /grant:r "$($ServiceIdentity):(OI)(CI)F" '*S-1-5-32-544:(OI)(CI)F'
```

Replace the example identity with the account that runs the service. The ACL grants access to that identity and the local Administrators group; verify it with `icacls $DataDirectory`. Do not grant access to broad groups such as `Users` or `Authenticated Users`.

Set `WMT_DATA_DIR` to this folder and keep `WMT_DATABASE_PATH` inside it. The database, encrypted backups, report assets, and temporary plaintext snapshots/uploads inherit the folder ACL. Node's `mode: 0o600` and `mode: 0o700` options are not a substitute for NTFS ACLs.

Store production environment variables in the service manager's protected configuration, not in the Git checkout. Set `NODE_ENV=production`, `WMT_COOKIE_SECURE=true`, a bootstrap administrator credential for initial setup, and a backup passphrase of at least 20 characters. Remove the bootstrap credential from the service configuration after the first successful startup.

## Network and backup operation

Bind the application to loopback when a local TLS reverse proxy forwards requests. If the proxy runs on another host, bind only to the host's private clinic interface and restrict inbound access to that proxy. Do not expose the application directly to the internet. Keep the device adapter's network access limited to the clinic LAN.

Encrypted backup files still contain sensitive clinic information after decryption. Store and transport them only through clinic-approved protected storage. Restrict backup/restore to authorized administrators, periodically restore a synthetic backup in an isolated environment, and verify clinic backup retention and recovery procedures before cutover.

Run one application process against the database. SQLite is not intended to be shared between application instances or accessed over a network filesystem.
