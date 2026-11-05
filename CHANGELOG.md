# Changelog

All notable changes to RT Story Tracker (StoryTracker until 3.0) are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [3.0.0] - 2026-11-04

A new app, built from scratch for Windows, Mac and Linux. Nothing to set up and no server to run.

### Added
- **Write a book**: a page to write on, with bold, italic, headings, lists and alignment. Markdown shortcuts work too.
- **Projects, series, books, parts and chapters** in three columns. Drag to reorder, or use Alt and the arrow keys.
- **Live word counts** for each chapter, book and project.
- **Saves itself** a couple of seconds after you pause, and every five seconds while you type. Closing the app or switching
  chapters saves first.
- **Encrypted storage** on your own computer, with no database to install. A project with no password is private from a
  casual look. The password lock comes in 3.6.
- **A simple first run**: start a project, or try a sample.
- **Installers** for Windows, Mac and Linux. Windows and the Linux AppImage update themselves. Mac and the `.deb` tell you
  when a new version is out.

### Changed
- **Rebuilt in Electron**, replacing the Windows-only C# and WPF app. The old code is kept in `legacy-wpf`.
- **Renamed** from StoryTracker to RT Story Tracker.

### Removed
- **The PostgreSQL server**: the app no longer needs one.
- **For now:** themes, spell check settings, import and export from the old app. They come back in 3.1 to 3.4. See the
  [roadmap](ROADMAP.md).

## [2.3.0] - 2025-07-23

The last version of the old Windows app. Chapters in a rich text editor, on a PostgreSQL server you set up yourself. The
notes for it and older versions are on the [releases page](https://github.com/neogentrics/StoryTracker/releases).
