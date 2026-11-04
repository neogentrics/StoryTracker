---
title: StoryTracker Product Plan
subtitle: A place to write a book and keep everything that belongs to it
author: Recon Towers Dev Department
date: 2026-11-04
tags: [plan, product]
---

# StoryTracker Product Plan

This plan comes from the owner's answers on 4 November 2026. Where a line is his decision, it's marked **(his words)**
or listed in [decisions.md](decisions.md). Anything still open is in that file too, not settled here.

Why this exists: the project stopped at v2.3.0 in July 2025 because, in his words, *"I didn't have a full thought out
plan. I was just building what I thought I needed."* This is the plan.

## What StoryTracker is

A desktop app where an author writes their books and keeps everything about them in one place: the chapters, the
characters, the timeline, the world, the research, the ideas, and where each book stands.

It's part of the Recon Towers suite: free, never sold. Finished apps go on recontowers.com/apps/ and work in progress
on The Bench. StoryTracker is on The Bench until the rebuild is done.

## Who it's for

**Any author, from day one (his words).** The owner is the first and hardest test: 16 series and standalones in one
shared universe, about 170 character dossiers, and a timeline that crosses every series. If it holds that, it holds a
single novel.

That choice has one big effect on the design. Nothing about his system is built into the app. "Character" and
"Weapon", "Draft" and "Frozen", "Record 0100 · Revision 2" and the numbering ranges are all things an author can set
up. His system ships as one template; a plain novel template sits next to it.

## What it's for, in order

1. **Writing the book in it.** This is the main reason to open the app **(his words)**.
2. Keeping the canon: dossiers, timeline, places, lore.
3. Seeing where every book stands.
4. Keeping everything else a story needs: ideas, dictionaries, research **(his words)**.

## What it tracks

| Area | What's in it | Today, for the owner |
|---|---|---|
| Writing | Series, books, parts, chapters, scenes, word counts, goals | Word files in OneDrive |
| Records | Characters, weapons, materials, and any other type an author adds. Custom fields, links between records. | Master Characters, Weapons, Materials |
| Record versions | One version per book, Draft or Frozen, what each covers, a printable part and an author-only part | The dossier versioning system |
| Numbering | Number ranges per series, prefixes such as `W-001` | Grand Archive Numbering System |
| Timeline | Events on the author's own calendar (eras, epochs, or normal dates), tied to series and places, with a canon lock | Master Timeline |
| Places | Planets, cities, buildings, anything with a type, status and ruler | Locations & Planets |
| Lore pages | Free pages with links: world rules, races, magic systems, factions, writing rules | Universe Bible, Races, Crest System and others |
| Story ideas | Loose ideas and concepts, ready to become a book | `04_Story_Ideas`, To-Do List |
| Dictionaries | Glossary, invented words, pronunciation, the spell-check word list | Pronunciation Guide |
| Research | Sources, notes, pictures, PDFs | Story Research Library |
| Book tracking | Status, what's left, formats, publish dates, store links, to-dos | Book Catalog, Works in Progress |

## What it replaces

The goal is for the owner to use this **instead of Notion** for his stories. Here's how Notion is used today and what
has to be true before it can go.

| In Notion today | Size | StoryTracker must | Notion gives that a desktop app doesn't, so plan for it |
|---|---|---|---|
| Master Characters | About 170 dossiers, 195 versions | Hold every field, every version, the Draft/Frozen rule and the author-only part | Claude sessions can reach it: covered by Claude integration |
| Master Weapons and Materials | A few each, growing | The same, as more record types | |
| Master Timeline | Era, Epoch, Dimension, Series, Canon Locked | A timeline on a made-up calendar, with negative epochs | |
| Locations & Planets | Type, Status, Dimension, Ruling Entity | Places as a record type | |
| Reference and series pages | About 30 pages | Lore pages with links both ways | Pages open from any browser: covered by the companion |
| Book Catalog | Status, Series, Formats, Publish Date, links | Book records and a catalog view | |
| Works in Progress | A table kept by hand | A view built from the real books, so it can't go stale | |
| To-Do List, Research Library, Pronunciation Guide | | Tasks, research, dictionaries | |

**What Notion does today that the plan has to cover or give up:**

- It opens anywhere with a browser. StoryTracker's answer is the companion on phones and Chromebooks, which needs the
  desktop to be reachable (see [decisions.md](decisions.md)).
- Several Claude sessions write to it at once. A connector to a desktop app is one door, and the desktop has to be on.
- Filtered views of any database. StoryTracker needs saved views early, or the dossiers will feel worse than Notion.

**It doesn't replace:** Neo Gentrics Business Ops (accounts, formation, finances). That stays apart from the story
side, as it does in Notion today. Whether marketing and royalties come in is an open decision, because any author
might want them.

**The local Universe Dossiers folder** is a read-only mirror of Notion, with scripts that write files and PDFs. It
goes away when StoryTracker can print the same records. Until then it's the best test data there is: about 200
Markdown files with a regular shape.

**Gemini** works from the Universe Bible file and can't reach Notion. StoryTracker needs an export that writes the
same kind of file, so that habit keeps working.

## What the owner has decided

- **Format.** Everything lives in the app, in a format only it reads. You get files out by exporting **(his words)**.
- **Exports.** Word, PDF, Markdown, HTML, XML and more. Real `.pages` files aren't planned: Apple doesn't publish the
  format, and Pages opens Word files.
- **Import.** The app asks where your files are, looks at how they're arranged, then sorts them or asks you
  **(his words)**.
- **Privacy.** A password mode, so a project can't be read without getting into the app. It must have several ways
  back in if the password is lost, including an authenticator app on a phone **(his words)**.
  [Passwords and recovery](design/passwords-and-recovery.md) says how, and where 2FA can and can't help.
- **Claude integration.** It has to be in the app, with settings the author chooses, from read-only up to read and
  write **(his words)**. The default is off.
- **Devices.** Windows, Mac, Linux, laptops, phones, tablets, Chromebooks. Only the desktop app has the database;
  phones and Chromebooks sync with the desktop **(his words)**.
- **RT Markdown Reader.** The two apps link through App Link, and RT Markdown Reader goes first.

## What's already built, and what's worth keeping

The current app is C# and WPF on .NET 8, about 67 KB of code, seven releases from July 2025. The `multiversion`
branch holds the start of a .NET MAUI version; it stopped at the first commit, and MAUI has no Linux support anyway.

**Keep the ideas:**

| What | Why it's worth keeping |
|---|---|
| Stories made of numbered chapters, in a three-column layout | It's the right shape for writing, and the owner's main job for the app |
| Live word counts per chapter and per story | Authors use these every day |
| Story fields: title, type, genre, status | The start of book tracking |
| Spell check with a custom dictionary, and add-a-word from the right-click menu | Invented names need it; becomes part of Dictionaries |
| Eight themes, with Aero glass and High Contrast, and app-wide font control | The owner cares about this; RT Markdown Reader has the same taste |
| Export to TXT, RTF, Word and PDF, print preview, import of TXT and RTF | The start of the file-type work |
| Encrypting saved settings with the operating system | The same idea carries on for keys |
| The name, the repo and its history | |

**Don't carry over:**

| What | Why |
|---|---|
| The C# code itself | WPF runs only on Windows. Any author on any desktop means a rewrite whichever tool is chosen. |
| The login window and connection profiles | The whole point of the rebuild is no setup |
| iTextSharp 5.5 | AGPL licence and end of life. It doesn't fit a proprietary app. |
| Xceed.Words.NET | Under Xceed's own licence agreement; it would need checking before any reuse, and the rewrite removes the question |
| SQL written inside the window code | Hard to test, and it ties the app to one database |

**Gaps to know about:**

- Nothing in the repo creates the database tables, so a new user can't get the app working from the release alone.
- There are no tests, and no `LICENSE` file.
- `README.md` starts with a pasted chat reply ("We are ready to start v2.2…") and holds an older roadmap. The new
  [ROADMAP.md](../ROADMAP.md) replaces that roadmap.
- `connections.json` and `log.txt` are written to whatever folder the app runs from.

## How it fits together

```
 ┌─────────────────────────────── desktop app ───────────────────────────────┐
 │  Editor · Records · Timeline · Lore · Tracking                            │
 │  Library (all projects, stored by the app, encrypted when locked)         │
 │  Import / Export   App Link   Claude connector   Device sync              │
 └──────┬──────────────────┬─────────────────┬─────────────────┬─────────────┘
        │                  │                 │                 │
   .rtstory file    RT Markdown Reader   Claude Desktop   Laptop, phone,
   backup or move   (same computer)      and Claude Code  tablet, Chromebook
```

The main pieces, each with a design:

- [Database](design/database.md): PostgreSQL and SQLite side by side, with test results.
- [File types](design/file-types.md): what comes in, what goes out, and the folder import.
- [Working with RT Markdown Reader](design/working-with-rt-markdown-reader.md): App Link, pairing and sync, including
  phones.
- [Passwords and recovery](design/passwords-and-recovery.md): the password mode and the ways back in.

## How we'll know it worked

1. The owner writes a real chapter in it, by choice, on a normal day.
2. His Stories folder imports without losing a file, and without changing the originals.
3. All his dossiers, timeline events, places and lore pages are in it, checked against Notion.
4. A Claude session can look up a dossier and suggest a change.
5. He stops opening Notion for story work, and nothing is missing a month later.
6. Another author who has never seen it installs it and starts a book with no help, no account and no database setup.
