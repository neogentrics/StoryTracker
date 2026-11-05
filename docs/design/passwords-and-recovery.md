---
title: "Design: passwords and recovery"
subtitle: A real lock, with several ways back in
author: Recon Towers Dev Department
date: 2026-11-04
tags: [design, security]
---

# Passwords and recovery

The owner wants authors to be able to keep their writing secret: if someone tries to open the files, it should be a
*"garbled mess"*. He also wants several ways back in, so an author can always recover their work, including an
authenticator app on a phone.

Both can be done. One part needs explaining: an authenticator code can't be the key to encrypted data. It can still do
the job he wants, in the way described below.

## How the lock works

Encryption does the work here. A format only the app understands stops a double-click, not a determined person.

1. Each project gets its own random **project key**, 256 bits long. That key encrypts everything: the database, the
   pictures, the history.
2. The project key is never stored in the open. It's stored several times, each copy locked a different way. Each copy
   is a **key slot**, like spare keys in different safes.
3. Any one slot opens the project. Adding or removing a way in only changes the slots, not the whole project. Changing a
   password takes a moment even on a 6 GB project.
4. The first password is different. See [why the first lock re-encrypts](#why-the-first-lock-re-encrypts).

The password itself is never stored. It's stretched with a slow function (scrypt, as RT Markdown Reader's locked
documents use, or Argon2id) so guessing is expensive.

Every project is encrypted, even with no password set. Without a password, the app's own key is used, so other programs
see only garbage. That's privacy from casual looks, not real secrecy, and the app says so. A password is what makes it
real.

That app key is the same in every copy and sits in the public source code, on purpose. A key kept in the system's
encrypted storage would be a little harder to get at, but a project with no password would then die with that Windows
login, and its backups would be useless on a new computer. Losing a book is the worse risk. Setting a password removes
this slot, and moves the project to a new key.

## Why the first lock re-encrypts

The first version of this design only removed the app slot. Building it showed that isn't enough. Every copy and backup
made before the lock still holds that slot, and the slot opens with a key in the public source code. So anyone holding one
old backup would have the project key, and that key would open the locked project and all its later backups too.

So when a lock goes on, or comes off, the project moves to a new random key:

1. A second copy is built beside the project: the database rewritten under the new key, and each attachment encrypted
   again under a new name. A backup keeps attachments by name, so one name must never mean two keys.
2. The copy has to pass an integrity check.
3. The two folders swap, and the old one is deleted, along with the safety copies inside it.

A power cut before the swap leaves the old project, untouched. One during the swap is put right the next time the app
starts. It needs room for a second copy of the project while it works, and the app checks for that first.

What this can't do is reach backups and copies made earlier. Each still holds what it held, readable by anyone. The app
says so, makes a new locked backup at once, and offers to delete the older backups in the backup folder. Copies anywhere
else are the author's to delete.

## The ways back in

| Way in | How it works | Needs | Good for |
|---|---|---|---|
| **Password** | Opens its slot | Remembering it | Every day |
| **Recovery key** | A long code shown once when the password is set. Save it, or print it. It opens its own slot, and the author then sets a new password. | Keeping it somewhere safe | Forgot the password, on any computer |
| **Trusted computer** | A slot kept in the system's encrypted storage, tied to that person's login. Optional. | Being logged in to that computer | Forgot the password, at home |
| **Authenticator code** | A 6-digit code from an authenticator app, checked before the trusted-computer slot is used | The phone, on a computer already trusted | Forgot the password; stops someone else at the keyboard |
| **Paired phone** | The StoryTracker companion holds a slot. The computer asks, and the author approves on the phone. | A paired phone, once the companion exists | Forgot the password, and no recovery key to hand |

If every one of them is lost, the project can't be opened by anyone. No company holds a spare key: there are no accounts
and nothing to hold it in. The app has to say this plainly when a password is set.

## Why an authenticator code can't work alone

An authenticator app and the program checking it share a secret. The 6-digit code is worked out from that secret and the
time. For a code to open a file, the file would need that secret inside, or the key would have to be locked with a
6-digit code, which is only a million guesses. Someone who copied the file could try all of them in moments, without the
app. So a code that could open the file by itself would make a strong password worthless.

What a code **can** do is guard a door the app controls. That's why it's paired with the trusted computer: the key is
already there, kept safe by the system, and the app asks for the code before using it. So *"even if they get locked out,
they can still get in"* holds true on any computer they've trusted, and a stolen copy of the project file stays
useless.

The honest limit: this guards against someone using the app on that computer. Someone who has that person's Windows
login and real skill could go around the code. The password on its own, with no trusted computer, is the strongest
setting, and the author can pick that.

## What the author sees

- **Setting a password:** choose a password, see the recovery key, tick that you've saved it. Then an offer: trust this
  computer? An authenticator comes after that, from the Password and Lock screen, and pairing a phone once the companion
  exists.
- **Opening:** a lock screen. On a trusted computer it can open straight away, or ask for a code, as the author chooses.
- **Locking:** by hand, on closing the project or the app, after a set idle time, and when the computer locks or sleeps.
- **Forgot your password?** A link on the lock screen lists whichever ways this project has.
- **Security settings:** the list of ways in, with add and remove.

## Rules that follow

- A locked project is never sent over App Link, and never shown to Claude. Same as RT Markdown Reader's locked documents.
- Backups stay encrypted, and `.rtstory` files can be opened only through a slot. Backup folders of locked projects don't
  carry the title. A locked project can only be backed up while it's open, so it's also checked as it closes.
- Export asks for the password, then writes normal, readable files. The app warns that they aren't protected. So does
  saving a copy of an attachment. So do changes to any way in. One answer lasts five minutes, and ends when the project locks.
- A locked project shows a name the author picks, or *Locked project*. That name isn't secret.
- A trusted-computer slot never travels with a `.rtstory` file or through sync.
- Search indexes, thumbnails and history sit inside the encryption, so nothing leaks beside it.
- Temporary files for exports and App Link are deleted as soon as they're done with.

## The `.rtstory` file

| Part | Holds |
|---|---|
| Header | Marks it as StoryTracker, with the format version |
| Key slots | Password and recovery-key slots |
| Body | The encrypted project |

Trusted-computer and phone slots stay on those devices, so a copied file offers only the password and recovery key.

As built in 3.2: the marker `RTSTORY` and a line break, then a four-byte header length and a JSON header holding the
format version, the project ID, and each part's name, size and SHA-256. The parts follow one after another: `keys.json`
and the encrypted `project.db`. The header holds no title and no writing. A file is unpacked to a temporary folder, its
checksums are checked, and the project has to open and pass an integrity check before it reaches the library.

## The honest limits

These aren't bugs. They're what a lock like this can't do, and the author should know them.

- **Older copies stay as they were.** See above.
- **Deleted isn't erased.** The old files are deleted, not scrubbed. On a modern drive nothing can promise that, and
  OneDrive and similar services keep their own earlier versions.
- **Changing a password doesn't change the key.** Someone who holds an older copy and learned the old password has the
  key, and that key opens later copies too. Taking the password off and setting a new one moves the project to a new key.
  Backups keep the password they were made with, so an old backup needs the old password.
- **A trusted computer with no authenticator is only as safe as the login.** Forgot your password there gives full
  access, including export and removing the lock.
- **Someone using your login has more room.** They can reset the count of wrong codes in `trusted.json`, or put back a
  sealed record from before an authenticator was added.
- **A running app holds the key.** While a project is open, its key is in memory. That's what locking is for.
- **The spelling dictionary sits outside the lock.** Words added to it are shared by every project, kept by Chromium in a
  plain file, and listed in Preferences while a project is locked.
- **Sizes show.** The project's ID and the size of each file can be seen. What's in them can't.
- **Nothing in `keys.json` proves who last changed it.** Someone who can write to a project's files can delete a way in,
  damage the file, or change the name shown while it's locked. They still can't read anything. There's one copy of it, so
  a damaged one needs a backup. While a project is open the app doesn't ask that file again whether it's locked.

## What to test before it ships

- Every way in, each way out, and every wrong answer
- Forgetting the password with each way in removed in turn
- A power cut while a slot is being changed: the old way in must still work
- Searching a copied locked file for known words: none should be found
- An outside review of this design and the code. Don't release encryption nobody else has looked at.

The first four are automated in `test/security.test.cjs` and `test/e2e/lock.e2e.cjs`. The password itself is stretched with
scrypt at N=2^17, r=8, p=1, which costs about a quarter of a second and 128 MB for each guess. The recovery key is 160 random
bits. The authenticator follows RFC 6238, and is tested against its published values.

## For RT Markdown Reader

The owner also wants 2FA there *"at some point"*. Its `.mdlock` files use a single password today, so the same design
applies: recovery key first, then a trusted computer with an authenticator check. It's on the list in
[Working with RT Markdown Reader](working-with-rt-markdown-reader.md#changes-for-rt-markdown-readers-roadmap).
