# RT Story Tracker

A place to write a book and keep everything around it: characters, timelines, lore, ideas, research and where every book
stands. For any author, on Windows, Mac and Linux, with nothing to set up and no account.

**Status:** being rebuilt from scratch. The foundation is done, but there's nothing to write in yet. That's version 3.0.

- [Roadmap](ROADMAP.md): what gets built, in order
- [Product plan](docs/product-plan.md): who it's for and what it has to do
- [Decisions](docs/decisions.md): what's settled and what's still open
- Designs: [database](docs/design/database.md), [file types](docs/design/file-types.md),
  [passwords and recovery](docs/design/passwords-and-recovery.md),
  [working with RT Markdown Reader](docs/design/working-with-rt-markdown-reader.md)

## Running it

You need Node.js 22 or newer.

```bash
npm install
npm start
```

```bash
npm test
```

```bash
npm run test:e2e
```

## How storage works

Every project is an encrypted database in the app's own folder, with its own random key. `src/main/storage` is the only
code that touches it, and the [roadmap](ROADMAP.md#step-zero--settle-the-foundations) says why the rules there can't be
added later. A project with no password can be opened by any copy of this app, so that's privacy from a casual look, not
secrecy. The password mode in v3.6 is what makes it real.

## The old app

Versions 1.0 to 2.3 were a Windows app in C# and WPF that needed a PostgreSQL server. Its code is in
[legacy-wpf](legacy-wpf), for reference only. It isn't built or shipped.

## Licence

Proprietary, with the source public for reference. See [LICENSE](LICENSE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
