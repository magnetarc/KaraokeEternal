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

The installer detects the SSH/sudo NAS user's existing groups and prepares a
persistent `compose.nas.yaml` adding those groups to the current application
user. The application UID/GID and config ownership are retained. This grants
access to DSM-protected media while keeping the application non-root. Media
permissions and the read-only mount are retained. Host-specific settings,
diagnostics and config backups are excluded from Git and image builds.

If an earlier installation shows `EACCES: permission denied, scandir '/media'`,
run `sudo sh /volume1/docker/karaoke-modern/repair-media-access.sh`. It verifies
the NAS identity's read access first, stops only the new application, backs up
its config under `backups/media-access-*/config`, adds NAS groups to the existing
application identity and recreates this service using its existing image. It does not
rebuild or import metadata. Existing accounts/categories/queues remain in the
same volume. A failure after stopping attempts to restore the previous
runtime settings and service, saving startup logs first. Readiness uses the
container ID even while it is restarting. Success/failure status is saved in
`diagnostics/media-access-result.json`. Keep `compose.nas.yaml` for future
deployments. `diagnose-nas-access.sh` gathers diagnostics without changing the
running service; an isolated startup probe uses a temporary copy of a prior
stopped-config backup and removes its probe resources afterwards.

The Compose helper selects override files using explicit function arguments,
avoiding old BusyBox ash function-prefix assignments that can persist after
validation. A missing requested override is an error, never a silent fallback.
Post-restart checks inspect the initial application's groups in `/proc/1/status`.
Validation stdout/stderr and the last health-check error are retained beside
each stopped-config backup, in addition to server startup logs and state.

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

## Updating the existing installation

The version-selection update supplies tested prebuilt images for AMD64 and
ARM64 under `release-images/<source-commit>/<architecture>`. Source commit,
SHA256 and image ID are checked before use. Run the Windows `Update on NAS.cmd`
launcher and enter the NAS administrator password privately, or use:

```sh
sudo sh /volume1/docker/karaoke-modern/update-nas.sh
```

Keep the window open. The updater waits while scanner workers are active,
then loads the image, briefly stops only Karaoke Modern on 8092, backs up the
closed config volume and recreates it with the existing NAS groups. It does
not rebuild, reimport metadata or change media permissions. Database readiness
and song/version counts are saved to `diagnostics/update-result.json`. On
startup failure it attempts to restore the prior image and saves startup logs.

The library shows separate song and backing-track totals. Songs with multiple
scanned tracks have a **Versions (n)** button on desktop and phone. Choose a
filename, format and duration before adding it; that choice stays with the
queue entry. The regular Add button retains the host's preferred version.
Metadata source rows are not counted as playable versions until scanned.
