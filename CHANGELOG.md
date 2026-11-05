# Changelog

All notable changes to RT Story Tracker (StoryTracker until 3.0) are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [3.5.0] - 2026-11-05

Tell it where your files are, and it works out the rest or asks.

### Added
- **Find my files**, on the library screen and in the File menu. Point it at a folder and it sorts everything into series,
  books, parts, chapters, earlier versions and attachments, using folder names, file names, version marks and exact copies.
  Your originals are only ever read.
- **The plan**: a tree of what it found, before anything comes in. Rename anything, drag chapters and books, or leave
  out a file or a whole book.
- **Ask me**: anything it can't tell becomes a question, such as how a folder with no pattern is organized, or which of
  two files is newer. Anything you leave uses the choice shown.
- **Earlier versions go into history**: `v1`, `v2`, `Final`, `Copy`, `(before 2026-11-02)` and old folders. The newest
  file is the chapter and the rest are in its history, with their real dates. An older whole manuscript joins chapter by
  chapter, and if part of it matches nothing, the file itself is kept too.
- **Attachments**: pictures, audio, PDFs and anything else, kept with a book or the project, encrypted, and stored apart
  from the writing so a big file never slows it down. The same contents are only stored once.
- **Pictures in imported files**: pictures in Word, EPUB and OpenDocument files now stay with the book as attachments.
- **Covers** are found in a folder and set on the book, and books in a series get their series name and number.
- **The report** accounts for every file: what it became, what was left out and why. You can save it as a text file.
- **Stop and resume**: a folder import can stop at any point, by choice or by a power cut, and pick up where it was
  without repeating anything.

### Changed
- A `.rtstory` file now carries attachments. A project with none is written as before, so older versions can still open it.
- Automatic backups keep attachments in a folder beside the backups, copied once, so big files aren't written again every
  time. Restoring a backup finds them there.
- Export everything now includes attachments.

### Known limits
- Pictures sit beside the writing as attachments. They don't appear on the page yet.
- Zip files stay as attachments and aren't unpacked.
- Two exact copies are treated as one file wherever they are, even in different books, and the report lists each copy.

## [3.4.0] - 2026-11-04

Your work can come in now, from wherever it's been living.

### Added
- **Import** (Ctrl+Shift+I) brings in Word, Markdown, plain text, RTF, HTML, EPUB, OpenDocument, text from PDFs, Scrivener
  projects and, as best it can, Pages files. Your original file is never changed.
- **See it first**: the Import window lists the chapters a file will become, with their word counts, before anything is
  saved. Split at chapter titles, at headings, or keep it as one chapter. It can go into a new book or an existing one.
- **Word counts compared**: for Word files the app counts the words in the file and in the chapters, and tells you if they
  don't match.
- **AI clean-up** finds chat text at the top and bottom of a file, text wrapped in a code block, bold used as a heading,
  headings that start too deep, leftover symbol lines, straight quotes and doubled spaces. Each one is shown, and you can
  untick anything you want kept.
- **Word files** bring their headings, bold, italics, underlining, centring and comments, and templates with their own
  chapter styles are understood. A title styled as one names the book.
- **E-books** bring their chapters, cover and details. Markdown front matter fills in a book's details. A file only fills
  gaps in an existing book's details and never replaces them.

### Changed
- EPUB exports hide the landmarks list, so tools that convert an e-book to text no longer show it as a stray contents list.

### Known limits
- Pictures don't come in yet. The app tells you how many were left out, and they arrive with attachments in 3.5.
- A PDF doesn't record headings or paragraphs, so that text is an estimate. Check it against the original.
- Apple doesn't publish the Pages format. If a Pages file can't be read, the app explains how to export it to Word.
- A comment from Word lands on the words before its marker, which may be more or less than the words it first covered.

## [3.3.0] - 2026-11-04

Your work can leave the app now, in any format you need.

### Added
- **Export** (Ctrl+E) a chapter, a book, a series or the whole project as Word, PDF, EPUB, Markdown, HTML, OpenDocument,
  RTF, plain text or XML. Comments and anything in the Trash never go with it.
- **Store-ready EPUB**: a cover, contents, metadata, series details and accessibility notes, passing the official EPUB
  validator. The app tells you what a store is likely to ask for before you export.
- **Book details**: author, publisher, ISBNs, description, keywords, series, copyright page, dedication, acknowledgements,
  about the author and more, plus a cover picture.
- **Book layouts** for print PDFs and Word: six trim sizes, mirrored margins with the binding margin set from the page
  count, a contents page with real page numbers, running headers, page numbers and drop caps. Chapters can start on a
  right-hand page.
- **For print**: the last page is blank and the page count is even, unless you turn that off. For a re-upload, you can
  keep a fixed page count so the cover's spine still fits. Print files have no links, because KDP's previewer warns
  about them.
- **Preview and print** (Ctrl+P).
- **Export everything**: a whole project as a folder of Markdown, covers and CSV.

## [3.2.0] - 2026-11-04

Never lose a word, and a friendlier look.

### Added
- **Trash**: anything can be deleted now, even a chapter full of writing. It waits 30 days, and an Undo appears straight
  away. Whole projects can go to the Trash from the library too.
- **Earlier versions**: every chapter keeps copies as you write, at most every ten minutes. Compare any two, word by word,
  and restore one with a click. What was on the page is kept first, so a restore can be undone.
- **The `.rtstory` file**: a whole project in one encrypted file, to move or back up. Double-click one to open it. If you
  already have that project, the one it replaces goes to the Trash.
- **Automatic backups**: every hour, day or week, to a folder you choose, keeping the newest ones. Safe in OneDrive or
  Dropbox, because a backup is a closed file. Nothing runs until you pick a folder.
- **Filter** the chapter list by name, and show or hide the lists with one click.

### Changed
- **A friendlier look**: line icons, a clear main button, the book and chapter in the title bar, softer rounded lists and
  cards, and the Inter font for the app. Goals, Focus and Find moved to the top of the window, with Undo and Redo above
  the page.

### Fixed
- In split view, the left page lost its alignment buttons.

## [3.1.0] - 2026-11-04

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
