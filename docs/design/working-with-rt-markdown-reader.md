---
title: "Design: working with RT Markdown Reader"
subtitle: Sending files, keeping them in step, and pairing other devices
author: Recon Towers Dev Department
date: 2026-11-04
tags: [design, app-link, sync]
---

# Working with RT Markdown Reader

Neither app has user accounts. The owner's choices so far:

- **One file:** *Send to StoryTracker* and *Open in RT Markdown Reader*, with no pairing.
- **Same computer:** the apps find each other and he approves once.
- **Another computer:** a one-time pairing code creates a saved key.
- **RT Markdown Reader goes first.** Its 3.6 adds the same-computer link and sending a document. StoryTracker builds to
  those rules and doesn't invent its own.

Those rules are **App Link**, in `docs/app-link.md` in the `rt-markdown-reader` repo (protocol version 1, on branch
`feature/v3.6`). This page says how StoryTracker uses it, what it needs added, and how pairing and sync should work.

## As built in 3.7

StoryTracker's side of everything on this page down to [Keeping a file in step](#keeping-a-file-in-step-optional-sync), with
these differences:

- **`src/main/app-link.js` is RT Markdown Reader's own file** with this app's name in it. Both are read the same way, so a
  fix in one belongs in the other.
- **As what:** only a new chapter so far, or several if the document has chapter headings. Records, lore pages, ideas and
  research arrive with those features in v3.9 onwards.
- **The inbox is `Documents Sent Here`.** On the library screen a document waits with a note. A project that opens,
  locked or not, offers it.
- **Pictures come in, not out.** StoryTracker takes the optional `attachments` list in `open_document` and keeps pictures
  with the book. Sending them the other way would mean decrypting them to plain files for an app that ignores the field,
  so that waits until RT Markdown Reader reads it.
- **`kind` is accepted and ignored** until there's more than one kind.
- **Starting the other app.** Open in RT Markdown Reader looks where its installers put it, and if it can't be found it
  says so rather than opening some other editor. An AppImage can't be found this way, but works once linked and running.
- **The plain copy** for the no-link road lasts until the app closes, because the other app may still be reading it. It
  goes at once if the project is locked, and is swept at the next start if the app stopped first.

Tested in `test/link.test.cjs` and `test/e2e/link.e2e.cjs`, and by hand against RT Markdown Reader 3.10 from source: found,
linked, a chapter sent over, a document sent back with its own *Send to Linked App*, and a file handed over with no link.

**Still needed in RT Markdown Reader:** a *Send to StoryTracker* that works with no link. Today it sends only to a linked
app, so with no link the way in is Open With. See the list at the end of this page.

## What App Link version 1 already gives us

Read from `feature/v3.6` (commit `da9a6fa`) on 4 November 2026. RT Markdown Reader's side is built and tested on that
branch, but not released yet. The rules don't depend on a language, so they work whichever tool
[decision 11](../decisions.md) picks: named pipes on Windows, Unix sockets elsewhere, one JSON object per line. With
Electron, RT Markdown Reader's `app-link.js` can be reused as it is; with .NET, it's written again from the rules.

- Each running app leaves a file in a shared `Recon Towers/app-link` folder saying how to reach it, by named pipe or
  socket. Never a network address, and never a secret.
- `hello` needs no key. `pair` asks the person, in the app being asked, and returns a 32-byte key that both apps keep in
  the system's encrypted storage.
- `open_document` sends text or a path, and the app opens it unsaved. Nothing is saved because of a request.
- `unlink` ends it. App Link stays off until the person turns it on.

StoryTracker's app id is `rt-story-tracker`, the same as its repo. It was `storytracker` until 3.7.1, and links made before
that have to be made again. It implements all four methods.

**Trust on one computer:** any program running as the same person could claim any name, as the rules say. The approval
prompt and the key are what protect the link. That's a fair limit: a program already running as you can read your files
anyway.

## Sending one file

### From RT Markdown Reader to StoryTracker

`open_document` arrives. StoryTracker never files it silently. It shows one small window:

> **RT Markdown Reader sent "Chapter 12.md"**
> Add to: [project] as: [new chapter ▾ / new record / lore page / idea / research]   **Add** · **Not now**

If a password-locked project is closed, the document waits in an *Inbox* until the person unlocks it. It's still their
choice, and the text is held in memory, not on disk.

### From StoryTracker to RT Markdown Reader

*Open in RT Markdown Reader* on a chapter, a record, or a book. StoryTracker turns it into Markdown and sends it with
`open_document`, always as `text`, because chapters aren't files on the disk. It arrives as a new, unsaved document. That's a copy: changes there don't come back, unless the file is
linked (below).

### With no pairing

The owner wants this to work without a link. App Link needs a key for `open_document`, so this path doesn't use it. It
goes through the system instead, the same way as *Open With*:

- StoryTracker writes a temporary `.md` file and asks the system to open it with RT Markdown Reader.
- RT Markdown Reader starts StoryTracker with the file's path. StoryTracker takes any file path it's started with and
  shows the same *Add to* window.

It's safe with no key because a person just chose it and nothing is saved without their say. This also covers **an app
that isn't running**, which version 1 leaves out. The draft doesn't describe this path yet, so it's on the list below.

## What StoryTracker needs from the link

| | App Link v1 | Needed for |
|---|---|---|
| **StoryTracker's `accepts`** | `markdown`, `text` | Everything else converts before sending |
| **What gets sent** | `name`, and `text` or `path` | |
| **Pictures** | Not covered | A chapter with pictures. Add optional `attachments`, as a list of `{ name, path }` on this computer. Same-computer only, so paths work and the 8 MB line limit stays. |
| **What kind of thing it is** | Not covered | Add optional `kind`: `chapter`, `record`, `page`, `note`, `research`. A hint; the person still chooses. |
| **Word files** | Not needed | RT Markdown Reader already turns Word into Markdown, so it sends Markdown. One format on the wire. |
| **What comes back** | `{ opened: true }` | Enough for version 1. Later, add optional `placed` with a title, so the sender can say where it went. Never the content. |
| **Locked things** | `not_allowed` | Same rule both ways. A locked project or `.mdlock` is never sent. |
| **Whole books** | 8 MB a line | A 100,000-word book is about 600 KB, so this fits. |
| **Whole projects** | Not needed | App Link sends documents. A project moves as a `.rtstory` file, which only StoryTracker opens, so RT Markdown Reader has no use for one. |
| **Other file types** | Not needed | Covered by the Word row above: StoryTracker imports the rest itself, from files the person picks. |

File types on the link: **Markdown and plain text**, with PNG, JPEG, WebP and GIF as attachments. App Link stays simple
because StoryTracker does the converting at each end, for everything from [file types](file-types.md).

## Keeping a file in step (optional sync)

A chapter or record can be **linked** to one Markdown file. That file is on the disk, in the open. It's optional and
per item. Edit it in RT Markdown Reader, or in any program, and StoryTracker sees it.

**The rule: never overwrite silently.** Each side keeps the fingerprint of the last version both agreed on.

| What changed | What happens |
|---|---|
| Only the file | StoryTracker shows it as a change to accept or reject, using RT Markdown Reader's own *Compare* idea, or takes it straight away if the person has set that |
| Only the chapter | The file is updated, with the permission RT Markdown Reader's editing rules need |
| Both | Nothing is lost. Both versions are shown side by side and the person chooses |
| The file was deleted or moved | The link pauses and asks |

**What doesn't survive Markdown.** Comments, colours and page breaks don't exist in Markdown. StoryTracker keeps its own
copy and merges the text around them, so saving through a linked file doesn't wipe them.

**Locked projects:** a linked file is plain text on the disk, which defeats a password. Linking is off in locked projects,
and the app says why.

## Pairing with another computer

Not in App Link version 1. This section is the proposal for version 2.

1. On the computer you have, choose *Pair a device*. It shows a code like `K7QM-29FD-X4TZ`, good for five minutes and one
   use. Phones get the same thing as a QR code.
2. Type it on the other device. The two find each other on the home network, or through a shared folder.
3. Each makes its own key pair and they swap public keys. Each proves it knows the code, tied to those exact keys.
4. Each saves the other's public key in encrypted storage. From then on, the saved key is the proof, and the code is
   never used again.
5. Both show the device in a *Paired devices* list, with *Remove* beside it.

**Why a long code:** a short code would need a special exchange (a PAKE). The JavaScript ones found so far aren't audited,
and one says not to use it in production without an audit. Twelve letters and numbers, used once within five minutes, is
too many to guess in that window, and it needs only the encryption built into Electron and Node. QR codes can carry a full
256-bit secret. This should get the same outside review as the password design.

**What pairing allows:** nothing by itself. The person picks which projects a device can see, and what it can do: read,
or read and write.

## How paired devices talk

| Route | How | Good for |
|---|---|---|
| **Home network** | Devices announce themselves on the local network and connect directly, encrypted with the paired keys | Fast; laptops, phones and Chromebooks at home |
| **A synced folder** | The same idea as RT Markdown Reader's sync: each device writes its own encrypted file to OneDrive, Dropbox and so on | Two computers in different places, no server. The cloud service sees only garbage. |
| **A relay** | A small service that passes encrypted data along | Only if the phone has to work away from home. See below. |

## Phones, tablets and Chromebooks

The owner's idea, and it makes sense: **only the desktop app has the database.** The companion doesn't install any of
that. It pairs with the desktop and syncs.

- It keeps its own offline copy of the projects it's allowed, encrypted on the device, so it works on a plane.
- Changes queue on the device and go to the desktop next time they can reach each other.
- Most Chromebooks run Android apps, so one Android app covers both. A Linux-capable Chromebook can also run the full app.
- Built from the same screens as the desktop app, wrapped for Android.

**The catch:** the desktop has to be on and reachable. At home that's easy. Away from home, a phone can't reach a computer
behind a home router by itself, and a phone can't easily use a synced folder the way a computer does. The options are in
[decision 16](../decisions.md).

## Sync: what it needs from storage

This is what App Link's "not yet" depends on. Whichever database is chosen, the storage has to give sync these from the
first version, because they can't be added later:

| Needs | Why |
|---|---|
| A permanent random ID on every item | The same chapter has to be the same chapter on every device |
| A change log: what changed, when, on which device | So a device can ask "what's new since we last spoke?" |
| Removals kept as markers for 90 days | So a deleted item doesn't come back from a device that was off. RT Markdown Reader's sync does this. |
| Each device writes only its own file | Two devices never fight over one file, so no "conflicted copy" files. Also from RT Markdown Reader. |
| The live library outside synced folders | An open database in OneDrive can be damaged |
| Pictures fetched by name, separately | So 6 GB doesn't move on every sync |

**The merge rule is different from RT Markdown Reader's.** It keeps the newest of each item, which is fine for a highlight
and wrong for a chapter. For StoryTracker:

- **Fields on a record:** newest wins, per field. Two devices changing different fields both keep their change.
- **Chapter text:** if two devices changed the same chapter while apart, keep both and show them side by side. Never
  drop writing automatically. A smarter text merge can come later, if this comes up often.
- **Frozen records** can't be changed by sync at all, so a frozen record stays frozen on every device.

**Never synced:** trusted-computer slots, device keys, Claude settings, window positions.

## Changes for RT Markdown Reader's roadmap

For that repo's team, not made from here.

**App Link version 1 (3.6), small additions:**

1. Describe the no-pairing path (a person's choice, through the system's *Open With*), or say it's outside the protocol.
2. Add *Send to StoryTracker* and *Open in RT Markdown Reader* to the menus, working with or without a link.
3. Decide which app starts the other when it's not running. Version 1 leaves this out.
4. Add optional `attachments` and `kind` to `open_document`. They're additions, so old apps ignore them.

**App Link version 2 (a later 3.x):**

5. Pairing with another computer, as above. Add `pair_code` methods and a device list.
6. A method for a linked file: `file_changed`, with the new text and the fingerprint it was based on.
7. Add optional `placed` to the `open_document` reply.

**Other:**

8. A *linked file* marker in the reader, showing that a file is tied to a StoryTracker chapter.
9. Recovery and 2FA for `.mdlock` files: a recovery key first, then a trusted computer with an authenticator check. The
   owner asked for this. Reuse the design in [Passwords and recovery](passwords-and-recovery.md).
10. Share code instead of copying it: export, themes, AI services, the connector, sync. See
    [decision 14](../decisions.md).
11. Book layouts in its v4.0 and in StoryTracker should be one piece of work, not two.

## Sources

- `docs/app-link.md`, `src/main/app-link.js`, `src/main/connector.js` and `src/main/sync.js` in `neogentrics/rt-markdown-reader`
- [@cipherman/pake-js](https://www.pkgstats.com/pkg:@cipherman/pake-js) and [spake2 on npm](https://socket.dev/npm/package/spake2), which say they aren't audited
