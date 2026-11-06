---
title: StoryTracker Decisions
subtitle: What's settled and what's still the owner's to choose
author: Recon Towers Dev Department
date: 2026-11-04
tags: [plan, decisions]
---

# Decisions

Each open decision gives the choices, what depends on it, and a recommendation. The recommendations are suggestions.

## Settled

1. **The main job.** ✅ Writing the book in it.
2. **Who it's for.** ✅ Any author, from day one. His own system is a template, not built in.
3. **What it takes from Notion.** ✅ Dossiers, timeline and places, lore pages and book tracking, plus story ideas,
   dictionaries and research.
4. **The file format.** ✅ App-only: files are imported, and the way out is export. Chosen for privacy. The Markdown copy
   beside it was turned down. Real `.pages` export is off the list, because the format isn't published; Word covers Macs.
5. **Importing a folder.** ✅ The app asks where the files are, reads the structure, and sorts them or asks.
6. **Password mode.** ✅ Yes, with several ways back in, 2FA among them.
   [The design](design/passwords-and-recovery.md) explains what 2FA can and can't do.
7. **Claude integration.** ✅ It has to be in, with settings up to read and write. *Cloud Integration* in his dictated
   answer was taken to mean Claude; correct this if it meant something else.
8. **Devices.** ✅ Every kind. Only the desktop app has the database, and phones and Chromebooks sync with it.
9. **RT Markdown Reader.** ✅ It goes first on App Link, and StoryTracker builds to those rules. StoryTracker is off the
   App Store page until the rebuild is done, and stays on The Bench.

## Needed before building starts

All chosen. He took the recommendations on 4 November 2026. The options stay here as the record.

### 10. Which database?

✅ **Chosen 4 November 2026: C.** SQLite now, with encryption. His own PostgreSQL stays possible later.

He asked to see both with a test. [The design](design/database.md) has the results.

| Choice | In short |
|---|---|
| **A. Built-in PostgreSQL** | What he first named. Works, but a background server, bigger install, a migration every few years, and no built-in way to make the password mode real. |
| **B. Built-in SQLite** | Nothing to run, smallest install, and a truly encrypted file. Can't serve other computers directly, which sync doesn't need. |
| **C. SQLite, with your own PostgreSQL as an extra later** | B now, and a home server stays possible. |

*Depends on it:* step zero, and the size of v3.0.
*Recommendation:* **C**, which means building B now. The password mode is what decides it. Speed doesn't: both were far
faster than needed, and both survived every crash.

### 11. What to build it with?

✅ **Chosen 4 November 2026: Electron.**

The old WPF code runs only on Windows, so it's a rewrite either way.

| Choice | Good | Not so good |
|---|---|---|
| **Electron**, as RT Markdown Reader | Reuses export, themes, AI services, the connector, sync, tutorial, updates and the release process. App Link fits directly. The same screens can become the Android companion. | Bigger install, uses more memory. |
| **Avalonia** (C# on all three desktops) | Stays in C#, smaller and lighter. | Almost nothing from RT Markdown Reader can be reused. |
| **Tauri** (web screens, smaller core) | Much smaller install. | Rust instead of Node, so RT Markdown Reader's main-process code doesn't carry over. |

*Recommendation:* **Electron.** The owner sees this app as doing much of what RT Markdown Reader does, and that's where
most of the saved work is.

### 12. A library, or one file per project?

✅ **Chosen 4 November 2026: Library.**

| Choice | In short |
|---|---|
| **Library** | All projects live inside the app, as he described. `.rtstory` files are for backup and moving. Safe from OneDrive damage. Works with any database. |
| **One file per project** | Like a Word document: you pick where it lives. Familiar, but a live file in OneDrive risks damage, and PostgreSQL can't do it. |

*Recommendation:* **Library.**

### 13. The kind of editor

✅ **Chosen 4 November 2026: Rich text, with Markdown shortcuts.**

| Choice | In short |
|---|---|
| **Rich text, with Markdown shortcuts** | You see a page, as in Word and the old app. |
| **Markdown with a preview** | As in RT Markdown Reader. Reuses its editor, but you see symbols while you write. |
| **Both, with a switch** | Most work, and every feature is built twice. |

*Recommendation:* **Rich text with Markdown shortcuts.** Writing is the app's main job and most of his work is in Word.

### 14. Sharing code with RT Markdown Reader

✅ **Chosen 4 November 2026: Copy to begin with,** and share a piece once both apps use it and it has settled.

| Choice | In short |
|---|---|
| **A shared package** | Export, themes, AI, connector and sync live in one place for both, and the suite's later apps. More setup now, and changes need care in both apps. |
| **Copy what's needed** | Fastest start. Fixes must be made twice, and the copies drift apart. |

*Recommendation:* **Copy to begin with, and pull into a shared package once a piece is used by both and settled.**
App Link should be the first.

### 15. The name

✅ **Chosen 4 November 2026: RT Story Tracker.** The App Link id stays `storytracker`, and the file extension stays `.rtstory`. The repo keeps its name until he says otherwise.

The suite's pattern is *RT something*. The repo is `StoryTracker` and App Link's id is `storytracker`.

| Choice | Note |
|---|---|
| **RT Story Tracker** | Follows the pattern. |
| **StoryTracker** | Keeps the name as it is. |
| **Something else** | The app is now more than a tracker: it's where books get written. |

Renaming the repo later is possible, but RT Markdown Reader's rename showed the care it takes, so it's cheapest now.
This also sets the `.rtstory` extension.

*Recommendation:* none. It's a taste call. **RT Story Tracker** fits his own rule, if nothing better comes to mind.

## Needed before a later version

### 16. Phones away from home (before v4.0)

The desktop has to be reachable, and from outside the house a phone can't get through a home router by itself.

| Choice | In short |
|---|---|
| **Home network only** | Simple and private. Away from home it works from its offline copy and catches up later. |
| **The author's own VPN** | WireGuard or similar. Fine for anyone who already runs one; too much to ask of most authors. |
| **A small Recon Towers relay** | Passes along encrypted data it can't read. Works anywhere, no accounts, but it's a service to pay for and keep running. |
| **Cloud folder from the phone** | Phones read OneDrive or Google Drive through their own sign-ins, which needs registered apps with each company. |

*Recommendation:* **Home network first, with VPN for those who have one.** Decide on a relay if people ask.

### 17. iPhone and iPad (before v4.0)

The App Store plan covers Windows, Linux, Mac and Android, with no iOS, but he picked every device here. An iPhone app
needs an Apple Developer membership and has to go through Apple's store.

*Recommendation:* **Leave it for later.** Android and Chromebooks first.

### 18. Marketing and royalties (before v3.12)

[The suite's plan](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-suite.md) gives these to a new app, RT Author Desk, along with published editions, ISBNs, prices and store links. Is that right?

His answer on book tracking takes in the Book Catalog and Works in Progress. Notion also holds Marketing & Launches and
Sales & Royalties under Business Ops, which he's kept apart from the stories.

| Thing | Home if he agrees | What this app does |
|---|---|---|
| Marketing, launches, royalties, accounts | RT Author Desk | Nothing. It's off this roadmap's Later list. |
| Published editions, formats, dates, store links | RT Author Desk | v3.12's catalog shows them, read over App Link |
| Writing status, word counts, what's left | This app | Keeps them, and Author Desk shows them |

*Recommendation:* **Yes.** It's what he already set up: stories and business apart. Until Author Desk exists, v3.12's catalog
lets him type the published facts in, and they move across when it arrives.

### 19. Recovery defaults (before v3.6)

| Question | Recommendation |
|---|---|
| Must an author save a recovery key to set a password? | **Yes.** It's the one way that works on any computer. |
| Is *trusted computer* on or off by default? | **Off,** offered on the same screen. It's easier, but weaker. |
| Should the app warn if there's only one way in? | **Yes,** once. |

✅ **Built in 3.6 as recommended.** The warning turned out not to be needed: the password and the recovery key can only be
replaced, never removed, so a locked project always has at least two.

### 20. How Notion ends (before v3.14)

| Choice | In short |
|---|---|
| **Move and stop** | Import, check, then Notion's story side becomes read-only and stays as an archive. |
| **Move one area at a time** | Dossiers first, then the timeline, and so on, with Notion leading until each is proven. |
| **Keep a copy going** | StoryTracker leads and Notion stays updated. Most work, and it can go wrong quietly. |

Claude sessions today read and update Notion constantly, and other work depends on that, so the change has to be planned.
Those habits are written in his Claude memory, and need changing at the switch.

*Recommendation:* **One area at a time,** starting when v3.13 is out.

### 21. Licence (before v3.0)

✅ **Chosen 4 November 2026: the same as RT Markdown Reader.**

The repo has no licence. RT Markdown Reader is proprietary, with public source.

*Recommendation:* **The same as RT Markdown Reader.** It's the suite's pattern.

### 24. Where the new releases go (before v3.8)

Comparing this roadmap with RT Markdown Reader's added v3.17 to v3.20. They're numbered after what was already planned, so
nothing he's been told has changed number. That order isn't a recommendation.

| Choice | In short |
|---|---|
| **The suite first** | v3.17 moves up to be the next release, and the rest shift by one. It's small, and Author Desk, RT Press and RT Audio Studio are being planned to it. |
| **Leave them at the end** | Records and leaving Notion come first, as chosen in decision 22. The suite waits until v3.17. |
| **Pictures sooner too** | The suite, then v3.18, then Records. Pictures on the page matter to a book, and he's asked about them already. |

*Recommendation:* **The suite first,** then Records as planned. It's what the other apps are waiting for, and it doesn't
hold Records up by much.

### 25. Which app keeps which export (before RT Press starts)

RT Press starts from this app's book layouts and EPUB work and goes further, for designed print interiors and cover wraps.
Does this app keep them once Press exists?

| Choice | In short |
|---|---|
| **This app keeps its exports** | Anyone can still get a print PDF and an EPUB with no second app. Press adds design on top. Two places to maintain. |
| **Press takes print, this app keeps the rest** | Word, Markdown and EPUB stay here. Print PDFs move to Press. One home for print, but print then needs a second app. |
| **Press takes all of it** | The cleanest split, but this app stops being complete by itself, which goes against the suite's promises. |

*Recommendation:* **This app keeps its exports,** and Press shares the layout code rather than copying it. Every app in the
suite is meant to stand alone.

## The order, and where to start

### 22. Build order

✅ **Chosen 4 November 2026: Writing first, as written.**

The roadmap puts writing first, because that's his main reason for the app.

| Choice | In short |
|---|---|
| **Writing first, as written** | v3.0 to v3.7 make it a real writing app; records and Notion come after. |
| **Records sooner** | Move v3.8 to v3.12 ahead of v3.4 to v3.7. Reaches Notion's replacement sooner, while importing and the lock wait. |
| **RT Markdown Reader link sooner** | Move v3.7 up to right after v3.3. It's small, and RT Markdown Reader is ready for it first. |

*Recommendation:* **Writing first, as written.** Moving the link up is also fine, as it doesn't disturb anything else.

### 23. What to build first

✅ **Chosen 4 November 2026: Step zero, then v3.0.**

**Step zero, then v3.0.** Step zero can't start until 10 to 15 are settled, and 21 is needed for v3.0.
