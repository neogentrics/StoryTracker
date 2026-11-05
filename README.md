<div align="center">

<a href="https://recontowers.com/projects/storytracker/"><img src="docs/brand/banner.png" width="100%" alt="RT Story Tracker by the Recon Towers Dev Department. A place to write the book."></a>

<br>

[![Latest release](https://img.shields.io/github/v/release/neogentrics/StoryTracker?style=for-the-badge&label=latest&color=7c3aed&labelColor=150e22)](https://github.com/neogentrics/StoryTracker/releases/latest)
[![Tests](https://img.shields.io/github/actions/workflow/status/neogentrics/StoryTracker/ci.yml?style=for-the-badge&label=tests&labelColor=150e22)](https://github.com/neogentrics/StoryTracker/actions/workflows/ci.yml)
[![Platforms](https://img.shields.io/badge/windows%20%7C%20macOS%20%7C%20linux-b79cff?style=for-the-badge&labelColor=150e22)](#download)
[![Offline](https://img.shields.io/badge/works-offline-2e8fe0?style=for-the-badge&labelColor=150e22)](#how-your-writing-is-kept)

**[Download](https://github.com/neogentrics/StoryTracker/releases/latest)** &nbsp;·&nbsp; **[What it does](#what-it-does)** &nbsp;·&nbsp; **[Roadmap](ROADMAP.md)** &nbsp;·&nbsp; **[What's new](CHANGELOG.md)** &nbsp;·&nbsp; **[Project page](https://recontowers.com/projects/storytracker/)**

</div>

<br>

A place to write a book and keep everything around it: chapters today, then characters, timelines, lore, ideas, research
and where every book stands. For any author, on Windows, Mac and Linux, with nothing to set up and no account.

RT Story Tracker is part of the **Recon Towers** suite, built by its Dev Department. Version 3.0 is a new app, rebuilt from
scratch. Versions 1.0 to 2.3 were a Windows-only app called StoryTracker that needed a PostgreSQL server.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/writing.png" alt="A chapter open on the page, with books and chapters beside it"><br><b>Write.</b> A clean page, with your books and chapters beside it.</td>
<td width="50%"><img src="docs/screenshots/formatting.png" alt="A chapter with headings, a numbered list and a centred scene break"><br><b>Format.</b> Headings, lists and alignment, with Markdown shortcuts if you like them.</td>
</tr>
<tr>
<td><img src="docs/screenshots/theme-glass.png" alt="A chapter in the Dusk theme with Glass on"><br><b>Make it yours.</b> Fifteen themes, Glass with any of them, and seventeen fonts.</td>
<td><img src="docs/screenshots/find.png" alt="Find and replace, with every match marked on the page"><br><b>Find and replace.</b> In a chapter, a book or the whole project, with an Undo.</td>
</tr>
<tr>
<td><img src="docs/screenshots/comments.png" alt="A comment beside the words it's about"><br><b>Comments.</b> Notes on a selection that stay out of the book.</td>
<td><img src="docs/screenshots/split.png" alt="Two chapters side by side"><br><b>Split view.</b> Two chapters side by side.</td>
</tr>
<tr>
<td><img src="docs/screenshots/focus.png" alt="Focus mode, with just the page"><br><b>Focus mode.</b> Just the page.</td>
<td><img src="docs/screenshots/library.png" alt="The library, listing three projects with their word counts"><br><b>Your library.</b> Every project in one place, with nothing to set up.</td>
</tr>
</table>

## Download

| Windows | macOS | Linux |
|---|---|---|
| [`.exe` installer](https://github.com/neogentrics/StoryTracker/releases/latest) | [`.dmg` for Apple silicon or Intel](https://github.com/neogentrics/StoryTracker/releases/latest) | [`AppImage` or `.deb`](https://github.com/neogentrics/StoryTracker/releases/latest) |

The builds aren't code-signed yet, so Windows may show a SmartScreen warning the first time, and macOS will ask you to
open the app from *System Settings → Privacy & Security*.

## What it does

| | |
|---|---|
| **A page to write on** | Bold, italic, three heading sizes, lists and alignment |
| **Markdown shortcuts** | Type `#` and a space for a heading, `-` and a space for a list, or `**bold**` |
| **Series, books, parts, chapters** | Three columns, as in the old app. A project holds series and books, and a book holds parts and chapters |
| **Move things around** | Drag a chapter to reorder it, into a part, or to another book. Alt and the arrow keys work too |
| **Live word counts** | For the chapter, the book and the whole project, as you type |
| **Saves itself** | A couple of seconds after you pause, and every five seconds while you type. There's no Save button to forget |
| **Spell check** | With your own dictionary, so invented names stop being marked wrong |
| **Find and replace** | In a chapter, a book or the whole project. A replace across chapters has an Undo |
| **Themes and fonts** | Fifteen themes, Glass with any of them, seventeen fonts, and control of text size and page width |
| **Focus mode** | Just the page, until you press Esc |
| **Goals** | Words a day and words for a chapter |
| **Comments** | Notes on a selection, kept out of the book and its word count |
| **Split view** | Two chapters side by side |
| **Picks up where you left off** | Reopens the project and chapter you were in |
| **Private by default** | Every project is encrypted on your own computer |
| **Works offline** | No account, no server, and your writing never leaves your computer |
| **Updates itself** | On Windows and the Linux AppImage. Mac and the `.deb` tell you when a new version is out |

Coming next: version history and backups (3.2), export (3.3), import (3.4) and the password lock (3.6), then characters,
timelines and lore. See the [roadmap](ROADMAP.md).

## How your writing is kept

Every project is an encrypted database in the app's own folder, with its own random key. A project with no password can be
opened by any copy of this app, so that's privacy from a casual look, not secrecy. The password lock in 3.6 is what makes it
real. Only things with no writing in them can be removed for now, so no click can lose a chapter.

Tests kill the app outright while it's saving, on all three systems, and every reported save survives. The numbers are in
the [database design](docs/design/database.md#the-test-with-encryption-on).

## Running it from the source

You need Node.js 22 or newer.

```bash
npm install
```

```bash
npm start
```

```bash
npm test
```

```bash
npm run test:e2e
```

## How the code is laid out

- `src/main`: everything that runs outside the window. `workspace.js` checks every request from the window.
- `src/main/storage`: the only code that touches a project.
- `src/renderer`: the screens and the editor, bundled into `dist/renderer` by `npm run build:renderer`.
- `src/shared`: what both sides need, so the word count on screen and the saved one can't disagree.
- `legacy-wpf`: the old C# app, kept for reference. It isn't built or shipped.

The plan behind it all is in the [product plan](docs/product-plan.md), the [decisions](docs/decisions.md) and the designs for
the [database](docs/design/database.md), [file types](docs/design/file-types.md),
[passwords and recovery](docs/design/passwords-and-recovery.md) and
[working with RT Markdown Reader](docs/design/working-with-rt-markdown-reader.md).

## Licence

Proprietary, with the source public for reference. See [LICENSE](LICENSE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
