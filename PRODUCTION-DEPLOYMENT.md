# Karaoke Modern on the Synology NAS

Permanent project: `karaoke-modern`, stored at `/volume1/docker/karaoke-modern`.
The verified existing media folder is `/volume1/Media/10 - KARAOKE`, mounted
read-only as `/media`. The separate named `karaoke-modern-config` volume holds
accounts, queues, scan results, favourites and category decisions persistently.

The new installation uses port **8092**. The existing service continues on
**8089** while the new installation is brought up. Repointing the Shield or
replacing the old service requires a later cutover; this script does neither.

Copy the release contents, including `seed/catalogue-metadata.json`, to the
project folder. Over SSH, run:

```sh
sudo sh /volume1/docker/karaoke-modern/install-nas.sh
```

The installer searches both Synology Docker/Container Manager package paths
and supports either the `docker compose` plugin or `docker-compose` command.
The command search path is changed only within this installer. An SSH warning
about the missing Conor home directory does not prevent this absolute-path
installation; enabling home folders is unnecessary for this task.

The installer detects the SSH/sudo NAS user and prepares a persistent
`compose.nas.yaml` with that user's numeric UID/GID and existing groups. This
lets the application read DSM-protected media while remaining a non-root
process. Only the new config volume's ownership is adjusted; media permissions
and the read-only media mount are retained. Host-specific settings and config
backups are excluded from Git and Docker image builds.

If an earlier installation shows `EACCES: permission denied, scandir '/media'`,
run `sudo sh /volume1/docker/karaoke-modern/repair-media-access.sh`. It verifies
the NAS identity's read access first, stops only the new application, backs up
its config under `backups/media-access-*/config`, adjusts that config volume's
ownership and recreates this service using its existing image. It does not
rebuild or import metadata. Existing accounts/categories/queues remain in the
same volume. A failure after stopping attempts to restore the previous
runtime identity and service. Keep `compose.nas.yaml` for future deployments.

This builds the image, imports the prepared metadata before the first server
start, and launches the server. A fresh production database is marked as
managed, with no test banner. Repeat imports preserve existing host decisions;
QA databases and unknown existing databases are refused. The installer does
not reimport or restart an already running installation.

Open http://192.168.50.150:8092, create a host account/room, then add `/media`
under Account > Media Folders and scan. The seed supplies 56,652 artist/title
entries and unreviewed discovery suggestions; playable files come from the scan.
It contains no users, passwords, sessions or media. The old installation's
accounts, favourites and queues are not automatically copied into this one.

Check real MP3+G playback, phone QR access, search, queue controls and category
linking before making this the Shield's destination. To stop the new service:

```sh
cd /volume1/docker/karaoke-modern
sudo docker compose stop karaoke-modern
```

Keep its config volume. The old service/config remains available for rollback.
Local development and automated QA retain their separate test commands/files.
