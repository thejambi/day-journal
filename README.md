# DayJournal

**Remember your days.** A simple, smart journal app for macOS, Windows, and Linux.

One plain text file per day, kept in year and month folders — `Journal/2026/07/13.txt` — readable anywhere, forever, with no database and no lock-in. Sync the folder with Dropbox or anything else and your journal follows you. DayJournal is the cross-platform successor to the original [GTK/Vala DayJournal](https://github.com/thejambi/DayJournal) for Linux.

Built with [Tauri 2](https://tauri.app), Svelte 5, and CodeMirror 6. The installers are a few megabytes.

## How it works

- **One entry per day.** Pick a day on the calendar, write. Entries save automatically ~0.8s after you pause typing, and always on day switch, window blur, close, and quit. Saves are atomic (temp file + rename), so a crash can't truncate an entry.
- **The calendar shows your history.** Days with entries get a dot; today is outlined. Clearing an entry's text deletes its file and prunes empty month/year folders.
- **Past entries lock** (optional, on by default) so you don't accidentally rewrite history — one click (or `Cmd/Ctrl+U`) unlocks.
- **Timestamped sections**: `Cmd/Ctrl+N` inserts `3:45pm | ` so one day can hold many moments. `Cmd/Ctrl+D` starts the entry with its date heading.
- **Fast keyboard date travel**: `Cmd/Ctrl+T` today, `L`/`J` next/previous day, `K`/`I` a week forward/back.
- **Multiple journals** via the Journals menu (work journal, personal journal, …).
- **Journal archive export**: flatten everything (or one year) into a single styled, printable HTML document — print to PDF from your browser — or a plain text backup file, saved into the journal's `Archive/` folder.
- **Plays nicely with sync.** The journal folder is watched; entries arriving from another device update the calendar and reload the open day if you have no unsaved changes.

Open **Aa → Keyboard shortcuts** in-app for the full shortcut list.

## Development setup

Prerequisites:

1. **Node.js** 20+ (`node --version`)
2. **Rust** (stable) — install via [rustup](https://rustup.rs):
   ```sh
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
3. Platform extras:
   - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
   - **Windows:** [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and WebView2 (preinstalled on Windows 11)
   - **Linux:** WebKitGTK and friends:
     ```sh
     sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf \
       build-essential curl wget file libssl-dev
     ```

Then:

```sh
npm install
npm run tauri dev     # run the app with hot reload
npm run check         # typecheck the frontend (svelte-check)
cd src-tauri && cargo check   # typecheck the Rust side
```

The first `tauri dev` compiles all Rust dependencies and takes a few minutes; subsequent runs are seconds. Frontend changes hot-reload in place; Rust/config changes rebuild and relaunch the app automatically.

Note: in dev mode macOS shows a generic Dock icon — the real app icon only appears in built bundles.

## Building installers locally

```sh
npm run tauri build
```

Artifacts land in `src-tauri/target/release/bundle/`:

| Platform | Output |
|---|---|
| macOS | `macos/DayJournal.app` and `dmg/DayJournal_<version>_<arch>.dmg` |
| Windows | `nsis/*.exe` (installer) and `msi/*.msi` |
| Linux | `deb/*.deb` and `appimage/*.AppImage` |

Each platform can only build its own installers — build the dmg on a Mac, the exe on Windows. For everything at once, use CI (below).

A locally built app runs without complaint on the machine that built it. Distributing to *other* machines unsigned means Gatekeeper (macOS: right-click → Open) or SmartScreen (Windows: More info → Run anyway) warnings; the proper fixes are an Apple Developer ID + notarization and a Windows code-signing certificate.

## CI builds (all platforms at once)

`.github/workflows/build.yml` builds macOS (universal), Windows, and Linux on GitHub Actions:

- **Tag a release:** `git tag v0.2.0 && git push origin v0.2.0`
- **Or run manually:** GitHub → Actions → Build → Run workflow

Download installers from the run's **Artifacts** section. The macOS CI artifact is unsigned and will be quarantined by Gatekeeper; prefer a local build for Mac testing.

To bump the app version, update `version` in both `package.json` and `src-tauri/tauri.conf.json`.

The app icon is generated from `icon-source.png` with `npm run tauri icon icon-source.png`.

## Project layout

```
src/                        # Frontend (SvelteKit + Svelte 5)
  routes/+page.svelte       # Layout composition, keyboard shortcuts, editor mount
  lib/app.svelte.ts         # Shared reactive state + all actions
  lib/journal.ts            # File model: YYYY/MM/DD.txt, headings, sections
  lib/archive.ts            # Journal archive export (HTML / plain text)
  lib/editor.ts             # CodeMirror 6 setup, entry locking
  lib/settings.ts           # Persisted preferences (store plugin)
  lib/components/           # Toolbar (titlebar), Calendar, Overlays
src-tauri/                  # Backend (Rust)
  src/lib.rs                # Commands: save_note (atomic), collect_entries,
                            #   list_notes, move_to_trash, really_quit
  tauri.conf.json           # Window config (macOS overlay titlebar), bundling
  tauri.windows.conf.json   # Windows override: no native decorations
  capabilities/default.json # Permission grants for plugins
```

Almost all logic is TypeScript; the Rust side is a thin set of filesystem commands kept for speed (single-IPC folder walking) and safety (atomic saves, flush-before-quit).

Deferred from the original, planned for later: embedding images in entries and the Blip / Day One importers.

## License

GPL-3.0, same as the original DayJournal.
