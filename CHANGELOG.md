# Changelog

All notable changes to RT Story Tracker (StoryTracker until 3.0) are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [3.1.0] - Unreleased

Make it a place to spend a whole day.

### Added
- **Spell check with your own words**: right-click a word for suggestions or *Add to Dictionary*, so invented names stop
  being marked wrong. *Preferences* lists your words and turns checking off.
- **Find and replace** (Ctrl+F, Ctrl+H) in a chapter, a book or the whole project, with match case and whole words. A
  replace across chapters keeps a copy of the project first and has an Undo.
- **Fifteen themes**: RT Markdown Reader's, the old app's and a new one, Slate. High Contrast stays flat, and the rest
  have panels that run from one colour to another.
- **Glass**: frosted panels over colour, with any theme but High Contrast.
- **Seventeen fonts for the page**, with text size and page width, and a choice of font for the app itself. Five of the fonts
  come with the app, so a book looks the same on every computer.
- **Focus mode** (Ctrl+Shift+F): just the page. Esc brings everything back.
- **Goals**: words a day for a project and words for a chapter, with the day's count at the top of the window.
- **Comments**: notes on a selection, kept out of the book and its word count.
- **Split view**: two chapters side by side, each saving its own text.
- **Preferences** (Ctrl+,).

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
