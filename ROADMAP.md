---
title: StoryTracker Roadmap
subtitle: From a chapter editor to the place a book lives
author: Recon Towers Dev Department
date: 2026-11-04
tags: [roadmap, planning]
---

# Roadmap

Version 2.3 stored chapters on a PostgreSQL server you had to set up yourself, and it stopped there because there was no
plan. The [product plan](docs/product-plan.md) is that plan. This page lists the rebuild, in releases that can each be
tested on their own. The rebuilt app is called RT Story Tracker, and this replaces the older roadmap in the README.

> [!TIP]
> This file is written in Markdown, so it looks best opened in RT Markdown Reader.

**Legend:** 🙋 requested by the owner · 🛡️ needs a permission step · Size: **S** ≈ a day, **M** ≈ a few days, **L** ≈ a week or more

**Version numbers:** new features are 3.x releases (3.9 is followed by 3.10, 3.11…). 3.0 is a new major version because
it's a new app. The next one, 4.0, is kept for a change as big: the companion on phones and Chromebooks.

**Every release must:** install on a clean computer with nothing else set up, update from the release before it without
losing anything, and pass its automated tests on Windows, Mac and Linux.

| Release | Theme | Status |
|---|---|---|
| [v1.0–v2.3](#v10v23--the-first-app) | The first app | ✅ Released (Windows, needs a PostgreSQL server) |
| [Step zero](#step-zero--settle-the-foundations) | Settle the foundations | ✅ Done |
| [v3.0](#v30--write-a-book) | Write a book | ✅ Released ([3.0.0](https://github.com/neogentrics/StoryTracker/releases/tag/v3.0.0)) |
| [v3.1](#v31--comfortable-writing) | Comfortable writing | 🚧 Released as 3.1.0, being tested by the owner |
| [v3.2](#v32--never-lose-a-word) | Never lose a word | Planned |
| [v3.3](#v33--get-it-out) | Get it out | Planned |
| [v3.4](#v34--bring-it-in) | Bring it in | Planned |
| [v3.5](#v35--find-my-files) | Find my files | Planned |
| [v3.6](#v36--password-lock) | Password lock | Planned |
| [v3.7](#v37--rt-markdown-reader-on-this-computer) | RT Markdown Reader, on this computer | Planned |
| [v3.8](#v38--records) | Records | Planned |
| [v3.9](#v39--versions-of-a-record) | Versions of a record | Planned |
| [v3.10](#v310--timeline-and-places) | Timeline and places | Planned |
| [v3.11](#v311--lore-ideas-research-dictionaries) | Lore, ideas, research, dictionaries | Planned |
| [v3.12](#v312--where-every-book-stands) | Where every book stands | Planned |
| [v3.13](#v313--claude-integration) | Claude integration | Planned |
| [v3.14](#v314--leaving-notion) | Leaving Notion | Planned |
| [v3.15](#v315--two-computers) | Two computers | Planned |
| [v3.16](#v316--files-kept-in-step) | Files kept in step | Planned |
| [v4.0](#v40--the-companion) | The companion | Planned |
| [Later](#later--only-if-needed) | Only if needed | Ideas |
| [Ongoing](#ongoing--polish--distribution) | Polish & distribution | Ongoing |

## v1.0–v2.3 — The first app

✅ **Released, July 2025.** Windows only. Chapters in a rich text editor, themes, spell check, export to TXT, RTF, Word and
PDF, with data on a PostgreSQL server the user sets up. The [product plan](docs/product-plan.md#whats-already-built-and-whats-worth-keeping)
lists what carries over. It stays on The Bench and is off the App Store page until the rebuild is done.

## Step zero — Settle the foundations

Not a release: the choices that are expensive to change later. [Decisions](docs/decisions.md) 10 to 15 are made.

| Task | Size | Details |
|---|:-:|---|
| ✅ Finish the database test | S | [Done](docs/design/database.md#the-test-with-encryption-on) on Windows, Mac and Linux, with encryption on, from the real installers. |
| ✅ Project setup | M | The new app in this repo, with tests, CI on all three systems, a `LICENSE`, and a clean README. The old app is in `legacy-wpf`. |
| ✅ Storage rules | M | Permanent IDs, a change log and room for key slots, from the first table. [Sync](docs/design/working-with-rt-markdown-reader.md#sync-what-it-needs-from-storage) and the [lock](docs/design/passwords-and-recovery.md) can't be added later. |

**Test:** an empty app installs and opens on all three systems, and the test results are in the database design. ✅ Passed.

## v3.0 — Write a book

🙋 The main reason to open the app. No server, no login, nothing to set up.

| Feature | Size | Details |
|---|:-:|---|
| ✅ 🙋 Built-in storage | L | Everything saves by itself to the library. No database to set up, on any system. |
| ✅ Projects, books and chapters | M | A project holds series and books; a book holds parts and chapters. Drag to reorder, or use Alt and the arrow keys. Three columns, as in the old app. |
| ✅ 🙋 The editor | L | A page to write on, with bold, italic, headings, lists and alignment, plus Markdown shortcuts. |
| ✅ Word counts | S | Live, per chapter, per book and per project. |
| ✅ Saves itself | S | Two seconds after a pause, and every five during steady typing, with no Save button to forget. Closing or switching chapters saves first. |
| ✅ Installers & updates | M | Windows, Mac and Linux installers. Windows and the Linux AppImage update themselves. Mac and the `.deb` get a message with a download link, because a Mac app can't replace itself until it's signed. |
| ✅ A simple first run | S | One screen: start a project, or try a sample. |

Only empty chapters, parts, books and series can be removed for now, plus the sample. Anything with writing in it waits for
[Trash](#v32--never-lose-a-word), so no click can lose a chapter.

**Test:** on a clean computer, install it, write a chapter, pull the power, restart: the chapter is there. Killing the app
outright is tested on all three systems. Pulling the power is still a hand test.

## v3.1 — Comfortable writing

Make it a place to spend a whole day.

| Feature | Size | Details |
|---|:-:|---|
| ✅ Spell check & your own words | M | With a personal dictionary, and *Add to Dictionary* from the right-click menu. Invented names stop being marked wrong. |
| ✅ Find & replace | S | In a chapter, a book, or the whole project. |
| ✅ 🙋 Themes & fonts | M | RT Markdown Reader's themes and fonts, the old app's themes, a new Slate theme, Glass with any theme, and app-wide font control. |
| ✅ Focus mode | S | Just the page. |
| ✅ Goals | S | Words per day and per chapter. |
| ✅ Comments | M | Notes on a selection that stay out of the book. |
| ✅ Split view | S | Two chapters side by side. |

**Test:** the owner writes a real chapter in it, by choice.

## v3.2 — Never lose a word

Comes before import, because the first thing people will trust it with is years of work.

| Feature | Size | Details |
|---|:-:|---|
| 🛡️ Version history | M | Every chapter keeps its earlier versions; compare any two and restore with one click. |
| 🛡️ Automatic backups | M | On a schedule, to a folder you choose. A closed backup is safe in OneDrive or Dropbox. |
| The `.rtstory` file | M | A whole project in one file, to back up or move. Double-click to open. |
| Trash | S | Deleted things wait 30 days. |

**Test:** delete a chapter, restore it. Move a project to another computer with one file. Restore an old backup.

## v3.3 — Get it out

🙋 The app's format is private, so this is how your work leaves it. It ships before import, so nothing can ever go in
that can't come out.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Word | M | A chapter, a book, or a series as `.docx`, which also covers Pages on a Mac. |
| 🙋 PDF | M | With print preview, printing, and a contents page. |
| 🙋 Markdown, HTML, XML | M | Plus plain text and RTF. |
| 🙋 Store-ready EPUB | L | An EPUB that KDP and other stores' uploaders accept, with the cover, contents, metadata and book details they ask for, checked before it's saved. It does the job of a tool like Kindle Create in our own way, with nothing else to install. |
| OpenDocument | S | |
| Book layouts | L | Trim sizes, mirrored margins, front and back matter, for print PDFs and ebooks. To be shared with RT Markdown Reader's v4.0. |
| Export everything | S | A whole project as a folder of Markdown, pictures and CSV. |

**Test:** export a book to each format and open it in Word, Pages, Calibre and a browser. Upload the EPUB to KDP's previewer and at least one other store, and neither reports a problem.

## v3.4 — Bring it in

🙋 One file at a time, with Markdown first, because people bring in files made with AI.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Markdown | M | Front matter becomes fields; a long file can be split into chapters at its headings. |
| 🙋 AI clean-up | M | Finds chat text, stray symbols and odd headings in AI-made files, shows each, and asks. |
| 🙋 Word | M | Headings, italics, pictures and comments. Most manuscripts today. |
| More types | M | Plain text, RTF, HTML, EPUB, OpenDocument, and text from PDFs. |
| 🙋 Pages, best effort | M | Reads what it can; otherwise explains how to save as Word from Pages. |
| Scrivener | M | For authors moving over. |

**Test:** import a real Word manuscript and an AI-made Markdown file. Compare word counts with the originals.

## v3.5 — Find my files

🙋 Tell it where your files are, and it works out the rest or asks. [How it works](docs/design/file-types.md#importing-a-whole-folder).

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Folder scan | L | Reads names and contents, and sorts them into series, books, chapters, versions and attachments. The originals are never touched. |
| 🙋 The plan & *Ask me* | M | Shows what it thinks as a tree. What it's unsure of, it asks. Drag to fix. |
| Older versions go into history | M | `v1`, `v2`, `Final`, `Copy`: the newest is the chapter, the rest are its history. |
| Pictures and other files | M | Covers, audio and PDFs become attachments, stored apart so projects stay quick. |
| The report | S | Every file accounted for. Stop and resume at any time. |

**Test:** the owner's Stories folder (6.2 GB): every file is accounted for, and the originals are unchanged.

## v3.6 — Password lock

🙋 Lock a project so that without getting into the app it's garbled. [The design](docs/design/passwords-and-recovery.md).

| Feature | Size | Details |
|---|:-:|---|
| 🙋🛡️ Password | L | Lock any project. Everything in it is encrypted, including search and history. |
| 🙋 Recovery key | M | Shown once, to save or print. |
| 🙋 Trusted computer | M | Optional. This computer can open the project through your login. |
| 🙋 Authenticator (2FA) | M | Works with any authenticator app. A code before opening on a trusted computer, and a way back in if you forget the password there. |
| Lock when idle | S | Or on close, or by hand. |

**Test:** search a copied locked file for known words and find none. Recover using each way in. Get an outside review
before release.

## v3.7 — RT Markdown Reader, on this computer

🙋 Needs RT Markdown Reader 3.6. Built to [App Link](docs/design/working-with-rt-markdown-reader.md), not a second set of rules.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Send to StoryTracker | M | A document from RT Markdown Reader lands in a small window: which project, and as what. Works with no pairing. |
| 🙋 Open in RT Markdown Reader | S | A chapter, record or book opens there as a copy. |
| 🙋🛡️ Link once | M | The apps find each other and you approve once. Off until you turn it on. |
| Pictures come too | S | Needs App Link's `attachments`. |

**Test:** send a document each way, with and without a link, and with a locked project.

## v3.8 — Records

🙋 Where the story bible begins: characters, and anything else an author wants to track.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Record types | L | Characters, weapons, materials, or your own. Add any field: text, number, choice, date, a link to another record. |
| Templates | M | *A single novel*, *A series*, *A shared universe*. The owner's own setup is one of them. |
| 🙋 Records and links | M | Open a record, follow its links, and see everything that links back to it. |
| Saved views | M | Filter, sort and save, as tables or cards. Without this it feels worse than Notion. |
| Mentions | M | Type `@` in a chapter to link a record, and see every chapter a character is in. |
| Look up while writing | S | A side panel with the record, without leaving the page. |
| Numbering | S | Number ranges per series and prefixes like `W-001`, with the next free number offered. |
| Bring in records | M | From Markdown files or CSV. The Universe Dossiers folder is the test. |

**Test:** load every dossier, then find any character faster than in Notion. A new author can set up a plain novel.

## v3.9 — Versions of a record

🙋 What a record said as of each book, for authors who need it. Off in the simple templates.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Versions per book | M | `0100 v1`, `v2`, each tied to the book it covers, with *Changes since* filled in for you. |
| 🙋 Draft and Frozen | S | A version freezes when its book is published. It can't be edited after that: fixes go in the next one. |
| 🙋 A printable part and an author-only part | S | Hidden lore and notes stay out of print. |
| Print records | M | A record or a set as a PDF, with labels such as *Record 0100 · Revision 2*. Replaces the dossier scripts. |
| Canon lock | S | Locked items warn before they change. |

**Test:** freeze a version, try to edit it, and print a set without the author-only part.

## v3.10 — Timeline and places

🙋 One timeline across every series, on your own calendar.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Your own calendar | M | Normal dates, or eras and epochs, with negative numbers. |
| 🙋 Timeline | L | Events tied to series, records and places, shown as a line and a table, and filtered by series. |
| 🙋 Places | M | A record type with kind, status and ruler. Places can sit inside places. |
| Spot clashes | M | Flags a character who's dead by an event they appear in, or events out of order. |

**Test:** load the Master Timeline and Locations, and check them against Notion.

## v3.11 — Lore, ideas, research, dictionaries

🙋 Everything else a story needs.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Lore pages | M | Free pages, with links both ways. |
| 🙋 Story ideas | S | Jot it, tag it, and turn it into a book when it's ready. |
| 🙋 Dictionaries | M | Glossary and invented words, with meanings. Feeds spell check, and pronunciation for RT Markdown Reader's voices. |
| 🙋 Research | M | Sources, notes, pictures and PDFs, attached to what they're for. |
| One search | M | Across chapters, records, lore and research. |

**Test:** load the Universe Bible, Races and Research Library, and find a fact by search alone.

## v3.12 — Where every book stands

🙋 The Book Catalog and Works in Progress, kept current by the work itself.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Book catalog | M | Status, series, formats, publish date and store links. |
| 🙋 What's left | M | One view of every book: words, chapters done, what's next. It updates itself. |
| 🙋 To-dos | S | Per book or project, and in the text. |
| Reading order | S | Publication order and timeline order, side by side. |

**Test:** Works in Progress can be retired, because this view says the same thing on its own.

## v3.13 — Claude integration

🙋 Must be in the app, with settings for how far it goes. Follows RT Markdown Reader's connector.

| Feature | Size | Details |
|---|:-:|---|
| 🙋🛡️ Connect Claude | L | Claude Desktop and Claude Code can reach your projects, through a connector you add in one click. Locked projects stay out. |
| 🙋🛡️ Your choice of access | M | Per project: **Off** (the default), **Read only**, **Suggest** (you accept or reject each change), or **Read and write** (Claude edits directly). |
| A record of changes | S | Every change Claude makes is in version history, labelled and undoable. |
| AI assist (optional) | M | Your own AI service, as in RT Markdown Reader. Off until you turn it on. |

**Test:** a Claude session finds a dossier, suggests an edit, and it appears as a change to accept, then at each other level.

## v3.14 — Leaving Notion

🙋 The goal. Everything is ready, so now it moves.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Import from Notion | L | Pages and databases, with their links, from a Notion export or a token you create. Maps to your record types. |
| Check it matches | M | A report: every page counted, and any field that didn't land. |
| 🙋 Universe Bible export | S | One file with all that's canon, for Gemini and others that read only files. |
| Keep a Notion copy (optional) | M | Only if [decision 20](docs/decisions.md) says so. |

**Test:** a month of story work with Notion closed, and nothing missing.

## v3.15 — Two computers

🙋 Same work on a desktop and a laptop, with no account.

| Feature | Size | Details |
|---|:-:|---|
| 🙋🛡️ Pairing code | M | A one-time code on one computer, typed on the other. Each saves the other's key. |
| 🙋 Sync | L | Over your home network, or through a folder you already sync, encrypted. |
| Both changed it | M | Writing is never dropped: both versions are shown side by side. |
| Paired devices | S | See them, choose what each can reach, and remove any. |

**Test:** change different things on two computers offline, reconnect, and check both. Then change the same chapter.

## v3.16 — Files kept in step

🙋 Optional sync of a file with RT Markdown Reader. Needs App Link version 2.

| Feature | Size | Details |
|---|:-:|---|
| 🙋🛡️ Linked files | M | A chapter or record tied to one Markdown file, per item. Off in locked projects. |
| 🙋 Changes to accept | M | A change in the file shows up as something to accept or reject. |
| RT Markdown Reader on another computer | M | Using the same pairing as v3.15. |

**Test:** edit in each app, then in both at once. Comments in StoryTracker survive an edit from the file.

## v4.0 — The companion

🙋 Phones, tablets and Chromebooks. A second app, which is why it's a major version. Only the desktop has the database:
these devices sync with it.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 The Android app | L | Runs on phones, tablets and most Chromebooks. Pairs by QR code. |
| 🙋 Read & look up | M | Records, timeline and chapters, offline. |
| 🙋 Notes & ideas | M | Quick notes that land in the project. |
| 🙋 Write on it | L | Chapters on the go, queued until it reaches the desktop. |
| 🙋 Approve from your phone | M | The phone as a way back into a locked project. |

**Test:** write on a phone with no connection, reach the desktop later, and nothing is lost.

## Later — only if needed

💡 Ideas kept for later, if people ask for them.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Read aloud | M | Hear a chapter read in a natural voice, on your own computer and offline, using RT Markdown Reader's voices. |
| 🙋 Theme and font packs | M | Download more themes and fonts as packs, and share them with RT Markdown Reader. |
| Your own PostgreSQL server | M | Connect to a server you run yourself. |
| Marketing & royalties | M | Depends on [decision 18](docs/decisions.md). |
| Canon checking with AI | M | Read a chapter against the records and flag what doesn't match. |
| Scripts & screenplays | M | A writing mode, from the old roadmap. |
| Writing with others | L | Sharing a project with an editor or co-author. It needs a service in the middle. |
| Relationship maps | M | Family trees and who knows whom, drawn from the links. |
| iPhone and iPad | L | Depends on [decision 17](docs/decisions.md). |

## Ongoing — Polish & distribution

| Feature | Size | Details |
|---|:-:|---|
| Code signing | S | Windows and Mac, as for RT Markdown Reader. |
| Tutorial & Help Center | M | Grows with each release; any author has to be able to start alone. |
| Accessibility | S | Screen readers, contrast and keyboard use, checked in the tests. |
| Languages | L | The app in other languages, right-to-left text. |
| Recon Towers App Store | S | StoryTracker goes back on the App Store page when the rebuild is done. Until then it stays on The Bench. |

## Open decisions

The full list is in [docs/decisions.md](docs/decisions.md).
