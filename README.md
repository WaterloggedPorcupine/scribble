# Quire

A paper-feel writing desk for novels and short stories. Quire works on your laptop and your iPhone, offline, and keeps your character voices, ideas, and to-dos right next to the page.

- **Manuscript:** chapters → scenes, with a quiet word count and gentle pace ("about 1,667 a day from here").
- **Notebook:** characters (with colour, aliases, and *how they sound*), ideas, world notes, to-dos, an inbox, and a cutting room floor.
- **While you write:** character names coloured like syntax highlighting, `[TK: notes to self]` that collect into your to-do list, focus mode, typewriter scrolling, four paper themes, four typefaces.
- **What-ifs:** try another version of the story without touching the Book. Change, add, move or cut any chapter or scene; everything you leave alone reads exactly as the Book does (and picks up your fixes to it). **Read** any version start to finish, compare scenes side by side, and bring only the parts that work into the Book. A what-if can also become a story of its own.
- **Safety:** everything saves on your device first, keeps a version every 10 minutes, and can sync through your own Google Drive.
- **Import:** paste, Word/text/Markdown files, Google Drive, and Apple Notes (with a Shortcut).

---

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:5173>. Your writing is stored in that browser, so use the same browser each time (or connect Google Drive to sync).

---

## Use it on your iPhone

Your phone needs a real web address for Quire, so you put the app on a free host once. The easiest is Netlify Drop, which needs no Git:

1. Build the app (after doing the Google setup below, if you want Drive):

   ```bash
   npm run build
   ```

2. Go to <https://app.netlify.com/drop>, sign in, and drag the **`dist`** folder onto the page. Netlify gives you an address like `https://quiet-lamp-1234.netlify.app`. You can rename it in Site settings.
3. On your iPhone, open that address in **Safari**, tap **Share → Add to Home Screen**. Quire now opens full-screen like an app and works offline.
4. Each time you change the code: `npm run build` again and drag `dist` onto your site's **Deploys** page.

> On iPhone, the home-screen app and Safari keep **separate** storage. Always write in the home-screen app, and turn on Google Drive sync so your phone and laptop share the same stories.

---

## Connect Google Drive

This turns on two things: **importing** Google Docs and Word files from your Drive, and **syncing** between devices. Quire only asks for:

- `drive.file`: access to the files *you pick* in Google's file picker, nothing else in your Drive.
- `drive.appdata`: a hidden, private folder where Quire keeps its sync file (`quire-sync.json`).

It takes about ten minutes, once.

1. **Create a project.** Go to <https://console.cloud.google.com>, click the project menu at the top → **New project** → name it `Quire` → **Create**. Make sure it's selected.
2. **Turn on the APIs.** Go to **APIs & Services → Library**. Search for and **Enable** both **Google Drive API** and **Google Picker API**.
3. **Set up the consent screen.** Go to **APIs & Services → OAuth consent screen** (also called *Google Auth Platform*).
   - App name `Quire`, your email as the support and developer contact.
   - Audience: **External**, and leave it in **Testing**.
   - Under **Test users**, add your own Google address.
   - Under **Data access** (scopes), add `.../auth/drive.file` and `.../auth/drive.appdata`.
4. **Create the sign-in client.** Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized JavaScript origins:** `http://localhost:5173` and your Netlify address, e.g. `https://quiet-lamp-1234.netlify.app`.
   - **Authorized redirect URIs:** the same two, **with a trailing slash**: `http://localhost:5173/` and `https://quiet-lamp-1234.netlify.app/`.
   - Copy the **Client ID**.
5. **Create an API key** (the file picker needs one). **Credentials → Create credentials → API key**. Then edit it:
   - *API restrictions:* restrict to **Google Picker API**.
   - *Application restrictions:* **Websites**, and add `http://localhost:5173/*` and `https://quiet-lamp-1234.netlify.app/*`.
6. **Find your project number.** Click the project menu → **Project settings** (or **IAM & Admin → Settings**). Copy the **Project number**.
7. **Give them to Quire.** Copy `.env.example` to a new file named `.env.local` and fill in the three values. Then restart `npm run dev`, and rebuild and redeploy for your phone.

When you connect, Google will say *"Google hasn't verified this app."* That's expected for a personal app in Testing mode: click **Continue**.

**How sync behaves:**
- Quire syncs when it opens, every 90 seconds while open, and when you switch away.
- Google sign-ins last an hour. With *Reconnect automatically* on (Settings), Quire quietly bounces through Google when you open it after that. If it ever shows **Reconnect**, tap it; your writing is safe on the device in the meantime.
- If the same scene was changed on two devices before they synced, the newer version wins and the other is saved in that scene's **Earlier versions** (marked "from a sync conflict"). Nothing is silently thrown away.

---

## Bring in notes from Apple Notes

Apple doesn't let other apps read Notes directly, so a Shortcut copies notes to the clipboard and Quire pastes them in. Notes separated by lines like `=== Title ===` arrive as separate items in your **Inbox**, where you sort each one into a character, idea, world note, to-do, or scene.

**One note, from the Share button:**

1. Open the **Shortcuts** app → **+** → name it **Send to Quire**.
2. Tap the **ⓘ** (details) button and turn on **Show in Share Sheet**. Set it to receive **Text** and **Rich Text**.
3. Add the action **Copy to Clipboard** (input: *Shortcut Input*).
4. Add **Show Notification**: "Copied. Open Quire and tap Import → Paste from clipboard."

Then in Notes: open a note → **Share** → **Send to Quire** → open Quire → **Import** → **Paste from clipboard**.

**A whole folder at once:**

1. New shortcut, **Notes folder to Quire**.
2. **Find Notes** where **Folder** is your folder (for example *Story ideas*). If your iOS doesn't offer a folder filter, filter by name instead.
3. **Repeat with Each** (the notes). Inside it, add a **Text** action:

   ```
   === [Repeat Item → Name] ===
   [Repeat Item → Body]
   ```

   (Tap the variable to pick *Name* and *Body*. If *Body* isn't offered, use *Repeat Item* itself.)
4. After the repeat: **Combine Text** (*Repeat Results*, with *New Lines*) → **Copy to Clipboard** → **Show Notification**.

Run it, open Quire, **Import → Paste from clipboard**, and choose **Inbox**.

> If you use Quire in desktop Safari or Chrome, a shortcut or bookmark can open `https://your-site/?import=clipboard` to jump straight to the paste step.

---

## Importing stories

**Import** (on the shelf or the bottom of the sidebar) accepts:

| Source | What comes through |
|---|---|
| Paste | Formatting kept; `=== Title ===` lines split it into several notes |
| Files | `.docx`, `.txt`, `.md`, `.html` |
| Google Drive | Google Docs, Word files, text and Markdown files |

Choose **Inbox**, **A new story**, or **Add to this story**. With *Split into chapters and scenes* on:

- Heading 1/2, or a short line like *Chapter 3*, *Part Two*, *Prologue*, starts a chapter.
- Heading 3 starts a titled scene.
- A scene break (`* * *`, `***`, `#`, `~~~`) starts a new scene.

---

## Your data

- Everything lives in your browser's storage on each device (IndexedDB), and Quire asks the browser to keep it permanently.
- **Settings → Backup** downloads a single file with every story and note. Restoring merges it in (newer versions win; anything replaced goes into version history first).
- Each story exports as **Markdown** or as an **HTML manuscript** that Word, Pages and Google Docs open with formatting intact.

---

## What-ifs

The **Book** is the version you mean to publish. A **what-if** is another version you're trying out.

- **Start one** from the version menu under the story title, or the *What-ifs* card on the desk. While you're in it, the binder shows a mark next to anything it changes (• changed, + new), and the editor shows which what-if you're writing in.
- **Write normally.** The first time you change a Book chapter or scene in a what-if, Quire quietly copies it. Deleting in a what-if only cuts it from that version.
- **Read it.** *Read* puts the whole story together the way a reader would meet it, in any version, with what differs from the Book marked in the margin.
- **Bring it in.** The what-if's page lists every difference. Compare a scene with the Book's, then bring it in, discard it, or bring everything in at once. Bringing in a chapter brings everything the what-if did inside it. Whatever the Book had is kept in that scene's *Earlier versions*.
- **Changes are per part of a scene:** title, outline line, text and position. If a what-if only moved a scene, it still picks up your later fixes to that scene's text in the Book. If the Book and the what-if both changed the same thing, the what-if's page tells you before you bring it in.
- Which version you're writing in is remembered per device, so your phone can be in the Book while your laptop is in a what-if. What-ifs themselves sync like everything else.

## Project map

```
src/
  lib/db.ts            data model (Dexie / IndexedDB)
  lib/repo.ts          create/update/move, word logging, version snapshots, bringing what-ifs in
  lib/branches.ts      what-ifs: putting a version together, listing its changes, which one is active
  lib/prose.ts         safe scene HTML for reading and comparing
  lib/sync.ts          Google Drive appData sync and merge
  lib/google/          sign-in, Drive API, file picker
  lib/import/          paste/file/Drive conversion and chapter splitting
  lib/export.ts        Markdown, HTML manuscript, backups
  editor/              the manuscript editor and its extensions
  components/          screens: shelf, desk, scene panel, notes, import, settings
  styles/              themes (Solarized light/dark, parchment, typewriter) and layout
```

## Ideas for later

- Stage play and screenplay formatting (the story `kind` is already stored)
- Real `.docx` export
- Drag-and-drop reordering in the binder
- A gentle optional daily nudge (web push works for home-screen apps on iOS 16.4+)
- Claude-suggested sorting for the inbox
- What-ifs, next: read two versions side by side, named milestones, continuity warnings when bringing a scene in (characters who appear later), sentence-level compare
- What-ifs that change the notebook (a character renamed only in one version)
