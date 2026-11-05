---
title: "Design: not locked to one file type"
subtitle: What comes in, what goes out, and the folder import
author: Recon Towers Dev Department
date: 2026-11-04
tags: [design, files]
---

# Not locked to one file type

The owner's model: **files are imported into the app, the app keeps them in its own format, and the way out is export.**
Inside the app it doesn't matter what a chapter started as. Markdown matters most, because people bring in files made
with AI.

The rule that keeps this from being a trap: **if it went in, it can come out.** Export is a first-class feature, not an
extra, and it ships before import does.

## What his files look like today

His Stories folder is 6.2 GB. Outside the dossiers, it holds about 546 PNG, 530 Word, 403 JPEG, 195 PDF, 53 Markdown, 27
zip, 20 text, 19 MP3, 14 MP4, 7 Excel, 6 HEIC, 5 Photoshop and 3 EPUB files. So in practice Word comes first and pictures
are most of the weight, even with Markdown as the headline.

## Inside the app

Chapters are stored as a structured document, not as Word or Markdown: headings, paragraphs, bold, italic, lists, tables,
pictures, comments. A plain-text copy sits beside it for search and word counts.

The editor is a rich-text one, so an author sees a page rather than symbols, with Markdown shortcuts (type `#` and a
space for a heading) for those who like them ([decision 13](../decisions.md)). A Markdown view sits one click away.

## What comes in and what goes out

| Format | Import | Export | Notes |
|---|:-:|:-:|---|
| Markdown (`.md`) | ✅ | ✅ | First class. Front matter becomes fields. Includes the AI clean-up below. |
| Word (`.docx`) | ✅ | ✅ | First class: most existing manuscripts. Keeps headings, italics, pictures, comments. |
| Plain text (`.txt`) | ✅ | ✅ | |
| Rich text (`.rtf`) | ✅ | ✅ | The old app stored chapters this way. |
| HTML | ✅ | ✅ | |
| XML | ✅ | ✅ | Our own documented layout for a whole project. |
| PDF | Text only | ✅ | Import is best effort: PDFs don't record what's a heading. Print layouts come with export. |
| EPUB | ✅ | ✅ | |
| OpenDocument (`.odt`) | ✅ | ✅ | LibreOffice and Google Docs users. |
| Pages (`.pages`) | Best effort | ❌ | See below. |
| Scrivener (`.scriv`) | ✅ | ❌ | Common among novelists, so it matters for "any author". |
| Obsidian or Notion export | ✅ | ❌ | Markdown folders with links, CSV for databases. |
| CSV | ✅ | ✅ | For records, timelines and dictionaries. |
| Images, PDFs, audio, video | ✅ as attachments | ✅ | Kept as they are. |

### Pages

Apple doesn't publish the format. Open projects have worked out enough to read `.pages` files (a zip of compressed,
undocumented records), but no working third-party writer turned up. As the owner said, building one would take too long
and might not even produce a readable file. So:

- **Export for Mac users is Word.** Pages opens Word files properly.
- **Import is best effort.** The app reads what it can, and if it can't, tells the author to choose *File → Export To →
  Word* in Pages.

## Files made with AI

Markdown from ChatGPT, Claude or Gemini often has things no author wants in a chapter. An optional clean-up step finds
them, shows each one, and lets the author accept or skip:

- Chat text around the content, such as "Here's your chapter:" at the top or "Would you like me to…" at the bottom
- Text wrapped in a code block
- `**Bold**` used for headings, or heading levels that start too deep
- Lines of `***` or `---`
- Straight quotes where the book uses curly ones, and doubled spaces

This repo's own `README.md` shows why: it starts with a chat reply that got pasted along with the file.

Nothing is changed without being shown first.

## Importing a whole folder

This is the owner's idea: *"it would see the file structure you have"*, then organize it or ask.

1. **Where are your files?** The author picks a folder. Nothing is touched, ever: the originals stay exactly as they are.
2. **Look.** The app walks the folder, reads names and the first part of each file, and counts everything.
3. **Work out the structure,** using these signs:
   - Folder names: `Series_The_Lepori_System`, `Book_1_…`
   - File names: `Chapter 3`, `Ch03`, `Prologue`, `Epilogue`, `Appendix`
   - Versions: `v2.0`, `Final`, `Manuscript - Version 2`, `(before 2026-11-02)`, `Copy`
   - Exact duplicates, by comparing contents
   - Kind of file: manuscripts, covers, PDFs for print, audio, notes
4. **Show the plan** as a tree: "These 18 files look like one book, in this order. These 4 look like older versions."
   Anything it isn't sure of goes in an *Ask me* list instead of being guessed.
5. **The author fixes it,** by dragging, renaming, or skipping whole folders. If a folder has no pattern, the app asks how
   it's organized, such as one book per folder, or one file per book.
6. **Import,** with a progress bar. It can be stopped and picked up again. Older versions go into each chapter's history
   rather than becoming separate chapters.
7. **Report.** What came in, what was skipped and why, and every file with a place in the project. Nothing is left
   unaccounted for.

The test case is his own Stories folder, and the pass mark is that every file is accounted for.

## Exporting

- One chapter, one book, a series, or a whole project, to any format in the table.
- **Book layouts:** trim sizes, margins, and front and back matter, for print PDFs and ebooks. RT Markdown Reader's v4.0
  plans the same work, so this should be shared, not built twice.
- **Records:** a dossier or a whole set to PDF, with or without the author-only part. This replaces the
  Universe Dossiers scripts.
- **Universe Bible:** one file with everything that's canon, for Gemini and anything else that can only read a file.
- **Export everything:** a full copy of a project as a folder of Markdown, pictures and CSV. It's the way out if an
  author leaves. It's always there, and it asks for the password on a locked project.

## The XML layout

Exported with version 1 of our own layout. A file is one `rtstory` element holding `book` elements. A `book` has `detail`
elements (`name` attribute), then `part` and `chapter` elements (`id` and `title` attributes, with chapters inside a part
where the book has parts). A chapter holds `p` and `heading` (`level`, 1 to 3) with an optional `align`, plus `list` (`type`
is `bulleted` or `numbered`) of `item`, `quote` and `break`. Inline text can hold `br`, and `span` with a `style` of any of
`bold`, `italic`, `underline` and `strike`, separated by spaces.

## Moving and backing up: `.rtstory`

The app's own format, as a single file: `.rtstory` (a working name, tied to [decision 15](../decisions.md)). It holds a
whole project, encrypted, for backups, moving to another computer, or sending to an editor. Double-clicking one opens it
in StoryTracker. Its layout is in [Passwords and recovery](passwords-and-recovery.md).

## Libraries to use

The old app's iTextSharp and Xceed packages don't carry over. RT Markdown Reader already reads and writes Word, PDF,
EPUB, HTML and Markdown, so the first step is to reuse that work. Anything new must have a licence that fits a
proprietary app: no GPL or AGPL.

## Sources

- [Reverse engineering iWork](https://andrews.substack.com/p/reverse-engineering-iwork)
- [iwork tool](https://github.com/cyberbryce/iwork)
