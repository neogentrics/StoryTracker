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

The password itself is never stored. It's stretched with a slow function (scrypt, as RT Markdown Reader's locked
documents use, or Argon2id) so guessing is expensive.

Every project is encrypted, even with no password set. Without a password, the app's own key is used, so other programs
see only garbage. That's privacy from casual looks, not real secrecy, and the app says so. A password is what makes it
real.

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

- **Setting a password:** one screen. Choose a password, see the recovery key, tick that you've saved it. Then an offer:
  trust this computer? add an authenticator? pair a phone?
- **Opening:** a lock screen. On a trusted computer it can open straight away, or ask for a code, as the author chooses.
- **Locking:** by hand, on closing the app, or after a set idle time.
- **Forgot your password?** A link on the lock screen lists whichever ways this project has.
- **Security settings:** the list of ways in, with add and remove.

## Rules that follow

- A locked project is never sent over App Link, and never shown to Claude. Same as RT Markdown Reader's locked documents.
- Backups stay encrypted, and `.rtstory` files can be opened only through a slot.
- Export asks for the password, then writes normal, readable files. The app warns that they aren't protected.
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

## What to test before it ships

- Every way in, each way out, and every wrong answer
- Forgetting the password with each way in removed in turn
- A power cut while a slot is being changed: the old way in must still work
- Searching a copied locked file for known words: none should be found
- An outside review of this design and the code. Don't release encryption nobody else has looked at.

## For RT Markdown Reader

The owner also wants 2FA there *"at some point"*. Its `.mdlock` files use a single password today, so the same design
applies: recovery key first, then a trusted computer with an authenticator check. It's on the list in
[Working with RT Markdown Reader](working-with-rt-markdown-reader.md#changes-for-rt-markdown-readers-roadmap).
