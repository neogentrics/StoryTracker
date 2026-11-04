---
title: "Design: the built-in database"
subtitle: PostgreSQL and SQLite, side by side
author: Recon Towers Dev Department
date: 2026-11-04
tags: [design, database]
---

# The built-in database

The owner asked for a small built-in PostgreSQL server, so users never set up a database, and asked to see both
PostgreSQL and SQLite with a test of each before deciding. This page has both designs, the test, and a recommendation.

**He chose Option C on 4 November 2026** ([decision 10](../decisions.md)): encrypted SQLite now, with his own PostgreSQL
possible later.

## What the database has to do

- Install with the app. Nothing for the author to set up.
- Hold all their data: text, records, history, and pictures or PDFs.
- Work on Windows, Mac and Linux.
- Survive crashes and power cuts.
- Be backed up without thinking about it, and survive app updates for years.
- Support the password mode, so a locked project is garbled to anything but the app.

Phones and Chromebooks don't need it: they sync with the desktop app **(his words)**.

## The test

Run on the owner's Windows 11 desktop on 4 November 2026, with throwaway scripts, since deleted. Both databases got the
same work: load about 200 real dossier files, search them, load a large stand-in project, then get killed hard mid-write
five times.

- **PostgreSQL:** 18.6, the stripped build `embedded-postgres-binaries-windows-amd64-18.6.0`.
- **SQLite:** 3.53.4, with its built-in text search (FTS5), in the safest save mode (WAL, full sync).
- **Stand-in project:** the dossiers repeated 50 times: 10,500 documents, 52.7 MB of text, roughly 90 novels.

| | PostgreSQL 18.6 | SQLite 3.53 |
|---|---|---|
| Set up a new database | 4.4 s | 7 ms |
| Start before first use | 0.65 to 1.26 s | No start: it runs inside the app |
| Background processes | 9 | None |
| Memory while idle | 31 MB | Part of the app |
| Empty database on disk | 39.7 MB | A small file |
| Load the dossiers (210 files, 1.1 MB) | 0.15 s | 0.02 s |
| Search the dossiers | 1.9 ms, 15 hits | 0.1 ms, 15 hits |
| Load the stand-in project | 8.0 s | 1.4 s |
| Search the stand-in project | 1.0 ms | 0.3 ms |
| Size on disk after loading | 288.5 MB | 81.9 MB |
| Backup | 0.53 s, a folder copy with the server stopped | 0.25 s, while running |
| After five hard kills | No saved row lost. Restart took 0.93 to 2.2 s | No saved row lost. Reopen with a full check took 0.25 s |

**What the numbers say:** both are far faster than any author will ever need, and both survived every crash. Speed
isn't a reason to choose either one. The choice comes down to everything below the table.

**What this test didn't cover:** Mac and Linux, real power cuts (killing a process isn't the same), encrypted SQLite,
and a real Electron build. Those are step zero of the first version in the [roadmap](../../ROADMAP.md).

## Option A: built-in PostgreSQL

**How it works.** The app ships the server. On first run it creates a data folder in the app's own storage, using a
random password and a port on this computer only. It starts the server when the app opens and stops it when the app
closes. The author never sees any of it.

**Licensing.** The PostgreSQL License is close to BSD and MIT: it can be bundled in any app, free, as long as the
copyright notice and disclaimers ship with it.

**Install size.** Measured from Maven Central, for the stripped builds:

| System | Added to the download | Unpacked |
|---|---|---|
| Windows x64 | 24 MB | 104 MB (of which 14 MB is leftover pgAdmin parts that can go, and 37 MB is ICU) |
| Mac (Intel or Apple Silicon) | 68 MB | Not measured |
| Linux x64 | 14 MB | Not measured |

RT Markdown Reader's installers are 109 to 137 MB, so StoryTracker would land somewhere near 150 to 200 MB.

**A catch in those builds:** they contain only `initdb`, `pg_ctl` and `postgres`. There's no `pg_dump`, `pg_restore` or
`pg_upgrade`, and no extensions. Those are the tools for backups and upgrades, so a real release needs either our own
build of PostgreSQL for each system, compiled in CI, or EDB's zip packages. EDB's zips are 328 MB (Windows) and 425 MB
(Mac) before trimming, have no Linux build for current versions, and their download page gives no licence terms. The
stripped builds also describe themselves as being for testing.

**Windows, Mac, Linux.** All three work. Things to handle:

- On Mac, every bundled program has to be signed and notarized along with the app.
- PostgreSQL won't run as administrator or root; `pg_ctl` deals with this on Windows.
- Handle a port already in use, a server left running after a crash, and antivirus scanning the data folder.
- Two processes can't share a data folder, so the app has to guard against being started twice.

**Upgrades.** Small releases (18.6 to 18.7) just replace the program files. Major versions change the data folder, so
each needs a dump and restore or `pg_upgrade`, and `pg_upgrade` needs both the old and new programs present. A major
version is supported for five years, so the app could move every three or four years. Plan: before a major move, the
old version writes a dump, the new version restores it and checks counts, and the old folder stays until the author has
opened their work. PostgreSQL 19 is due on 19 November 2026; start on 18 and move after 19 has had a few fixes.

**Backups.** `pg_dump` while running, encrypted, on a schedule, and the same dump inside a `.rtstory` file.

**Password mode: the weak spot.** As of PostgreSQL 18, the free version has no built-in way to encrypt its data files.
The words in an unlocked data folder can be pulled out with ordinary tools, so *"it would be just garbled mess"* wouldn't
be true. The ways around it all cost something:

| Way around it | Cost |
|---|---|
| Encrypt each piece of text in the app before storing it | The database can't search what it can't read, which throws away the main reason to use it |
| Pack and encrypt the whole folder when the app closes | A crash leaves it open, and it's slow with gigabytes of pictures |
| Rely on BitLocker, FileVault or LUKS | Outside the app, for the whole disk, and not per project |
| A commercial build with encryption | Not the free PostgreSQL, with its own licence |

**What PostgreSQL does better:** it's a real server. Many programs can use it at once and it can run on a home server.
It also carries forward what the old app was built on, and its text search and data types are the richer of the two.
None of that matters to one author on one computer, but it would matter for a shared server later (Option C).

## Option B: built-in SQLite

**How it works.** SQLite is a library inside the app, not a separate program. There's nothing to start, stop, or leave
running.

**Licensing.** SQLite is public domain. For encryption, SQLCipher Community Edition is BSD-style and
`better-sqlite3-multiple-ciphers` (for Electron) is MIT. Both need their notices shipped.

**Install size.** A few MB, to be measured in step zero.

**Windows, Mac, Linux.** Nothing to manage on any of them, and it also runs on Android, which helps the companion keep
its offline copy.

**Upgrades.** SQLite's file format has stayed compatible since 2004, so there's no major-version dance. Only our own
tables change, with numbered steps and a backup first.

**Backups.** SQLite copies a database while it's in use (0.25 s in the test).

**Password mode: the strong spot.** Encrypted SQLite encrypts the whole file, every page, and search still works once
unlocked. Without the key, it's garbled to any other program, which is what the owner described.

**App-only format.** SQLite's own site recommends it as an application file format: one file, a custom extension, an
app ID in the header. Without encryption, though, common tools can read a SQLite file. So every project should be
encrypted, even with no password set, using a key the app holds. That isn't real secrecy (only a password gives that),
but other programs would see only garbage, which is the behaviour the owner asked for.

**What it can't do:** other computers can't connect to it, and many writers at once isn't its job. Neither is needed
here: sync goes through the app, not the database.

## Option C: SQLite built in, your own PostgreSQL as an extra

SQLite is what installs. Later, an advanced setting lets someone connect to a PostgreSQL server they run themselves,
such as a home server, which is what the old app did. It needs the app's data code written so the database can be
swapped, which is good practice anyway. It adds testing work on every release, so it would wait until someone needs it.

## Side by side

| What matters | A: PostgreSQL | B: SQLite |
|---|---|---|
| No setup for the author | Yes, the app hides it | Yes, nothing to hide |
| Holds all the data | Yes | Yes |
| Crash survival in the test | Passed | Passed |
| Added to the install | 14 to 68 MB, plus backup tools | A few MB |
| Runs in the background | 9 processes | None |
| Password mode that's really garbled | **No built-in way** | **Yes** |
| App-only file | A dump wrapped in our own file | The database is the file |
| Yearly major-version work | Yes, every few years a migration | No |
| Work per release | Build, sign and test a server on each system | Very little |
| Shared server or other apps connecting | **Yes** | No |

## One correction

The question put to the owner listed "its data folder can't sit in OneDrive or Dropbox" as a cost of PostgreSQL. That's
true, but it's true of SQLite too: an open database in a synced folder can be damaged, and SQLite's own site warns
against network folders. Either way, the live library stays in the app's own storage. Closed `.rtstory` files and sync
journals are what go in OneDrive.

## Recommendation

**Option B, SQLite, keeping Option C open.** It isn't about speed: the test showed that doesn't matter. The reason is
the password mode, which came out of the owner's own answer on privacy. SQLite does what he described and free
PostgreSQL can't, and it also removes a background server, the upgrade work, and most of the install size for every
author who'll never know the difference.

**If he prefers PostgreSQL,** Option A is workable and the roadmap barely changes, but two things need answers first:
which of the password work-arounds above he'd accept, and who builds and signs the server for each system.

## Whichever is chosen

These hold for both, so the plan doesn't wait on this decision:

- **A library, not loose files.** All projects live in the app's storage, as the owner described: *"imported into the
  app"*. The `.rtstory` file is for backups and moving a project ([decision 12](../decisions.md)).
- **Pictures and big files** are kept as encrypted files in the library, named by their contents, and listed in the
  database. Keeping 6 GB of pictures inside a database makes every backup slow.
- **Every record has a permanent random ID** and a change log from the first version, because
  [sync](working-with-rt-markdown-reader.md#sync-what-it-needs-from-storage) depends on it and it can't be added later.
- **All database code sits behind one layer**, never in the window code, unlike the old app.
- **Tables update in numbered steps,** with an automatic backup first.

## Sources

- [PostgreSQL licence](https://www.postgresql.org/about/licence/)
- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/)
- [pg_upgrade](https://www.postgresql.org/docs/current/pgupgrade.html)
- [PostgreSQL 19 RC 1 announcement](https://www.postgresql.org/about/news/postgresql-19-rc-1-released-3409/)
- [EDB binary downloads](https://www.enterprisedb.com/download-postgresql-binaries)
- [Stripped PostgreSQL builds (zonky)](https://github.com/zonkyio/embedded-postgres-binaries)
- [Data-at-rest guide for PostgreSQL](https://oneuptime.com/blog/post/2026-01-21-postgresql-data-at-rest-encryption/markdown)
  (a third-party guide; the official docs weren't reached, so step zero confirms this)
- [SQLite as an application file format](https://sqlite.org/appfileformat.html)
- [SQLite over a network](https://sqlite.org/useovernet.html)
- [SQLCipher licence](https://www.zetetic.net/sqlcipher/license/)
- [better-sqlite3-multiple-ciphers](https://www.github.com/m4heshd/better-sqlite3-multiple-ciphers)
