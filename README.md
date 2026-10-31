# Business card filing game

A React/TypeScript game and a separate gameflow editor implementing
[the design](design_doc.md). Run `npm run dev`, then open:

- `/`: the filing game.
- `/editor`: the game state editor.
- `/?flowchart=<id>`: play a saved flowchart from this browser, opened with the
  editor's play button.
- [http://localhost:5173/demo](http://localhost:5173/demo): the original
  configurable grid demo and its eight-person fixture, available directly
  without a link on the home page or in the editor.

The game and editor fill the window width, giving the binder and flowchart
canvas more room on wide screens while retaining their responsive layouts on
narrow screens.

## Interface languages

The **English / 日本語** toggle at the top of every route switches the game,
all editor views, and the original grid demo immediately. English is the default.
The choice is remembered for this browser and origin under
`namecard-game.language.v1`; changing language does not restart the game, reload
the current draft, or change its selection, title, or saved gameflow data.
Storage failures are shown beside the toggle, and switching still works for
the current visit.

Interface messages live in [src/i18n/en.json](src/i18n/en.json) and
[src/i18n/ja.json](src/i18n/ja.json), with matching descriptive keys and
`{parameter}` placeholders. This includes help, confirmations, validation,
status/error messages, accessible labels, drag announcements, and flowchart
controls. Card text, character names, and authored document titles stay as
written; filenames and technical JSON field names are not translated.

React components use `useI18n()` from [src/i18n/context.ts](src/i18n/context.ts)
and fetch text with `t('editor.title')`. Use `msg(key, values)` for stored notices
and `LocalizedError` for application errors so an existing message can switch
languages without rerunning its action. The shared formatter in
[src/i18n/messages.ts](src/i18n/messages.ts) checks keys at compile time.
Add new interface text to both catalogs with matching placeholders; localization
tests check catalog parity, interpolation, and translated errors.

## Playing the game

The binder shows two person pages side by side. Each page has two columns and
four rows (eight pockets), making a four-column, four-row spread. Pocket order
runs left to right, then top to bottom within each person's page.
Inspect cards in the bin or binder and choose **Show back** to discover leads.
The inspection card flips in 3D; reduced-motion preferences disable the animation.
Drag cards into pockets, swap occupied pockets, or drag them outside the binder
to return them to the bin. Cards can be reordered within the bin. Drop onto a
highlighted bin position to insert the card at that exact position; other
cards shift rather than swap. The end drop zone, or a drop outside both the
binder and bin, appends the card to the end. This works in the desktop pile
and the narrow-screen horizontal strip.
When a bin card replaces an occupied pocket, the
displaced card returns to the bin. For keyboard or tap-only play, inspect a card,
choose **Choose a binder slot**, then **Place here** on either open page.
Escape cancels an active drag or closes the inspection dialog.
You can also close the inspection with the top-right **X** or **Close card** button.

A history locks only when every expected card is in its exact chronological
position starting at pocket 1, with no gaps or extra cards. Locked cards remain
inspectable. The person's **Call** button then becomes available. Viewing a
card back and calling a person are separate actions; in directed progression
mode, all incoming unlock conditions for a new card must be satisfied.
New cards appear in the bin.
Complete every page to reach the ending. Game progress lasts until reload or
restart; loading a new flow also starts a new game.

In **All cards unlocked** mode, every card is in the bin from the start.
Reading backs and making calls are optional and do not unlock more cards;
filing each person's history in the correct chronological order still locks
their page and completes the game.

All namecards (bin, binder pockets, inspection view, drag preview, the editor's
person-view tiles, and the grid demo) share one width:height ratio, 216:118,
defined once as `--card-aspect-ratio` in [src/index.css](src/index.css). On
narrow screens the binder spread scrolls horizontally, keeping both pages in
the same four-column, four-row layout without squeezing or stretching cards.

## Loading and authoring gameflows

Opening `/` uses these default sources, in order:

1. A configured Google Sheet, if its CSV loads and validates successfully.
   The live CSV is converted into an **all-unlocked** gameflow.
2. A custom `gameflow.json` in [public/](public/).
3. The included [Meisi sample](public/sample_meisi_gameflow.json): nine people
   and 53 cards, all unlocked and available in the bin from the start.

An explicit `?flowchart=<id>` always loads that saved flowchart instead of
Google Sheets. If Sheets is unavailable or its CSV is invalid, the game uses
the local sources and shows a warning with the cause. Malformed local files
and invalid local graphs remain errors rather than silently switching to the
sample. You can also import a JSON file directly in the game.

The original [fictional careers sample](public/sample_gameflow.json) remains
selectable in the editor: eight people, 40 cards, and five starters, including
introductions requiring two completed-page calls.

The editor opens in **Flowchart View** by default, with **Person** and **Event**
views also available for editing careers and their directed unlock relations.
The left sidebar contains **+ New flowchart**, which creates a blank flowchart
without replacing the open one, and a **Saved flowcharts** list for reopening
existing flowcharts. The open flowchart is highlighted, and each entry shows a
short ID to distinguish matching titles. On narrow screens the sidebar stacks
above the editor. **Flowchart title**
and **Rename** change its display title; its permanent UUID, saved JSON, and
play URL remain the same. Titles do not have to be unique. Switching flowcharts
returns to Flowchart View and clears the previous graph's selection.

The triangular play button saves and validates the currently open flowchart,
then launches a fresh game using that flowchart's JSON, not the public
`gameflow.json`. Gameplay shows its title, and **Back to flowchart** reopens that
same ID in the editor. Missing or invalid saved flowcharts show errors instead
of falling back to another game. Opening `/` without a flowchart ID still loads
the public file or sample described above.

Create people/cards, change ownership and starting
cards, edit front details (`misc`) and back text, and connect card-back or telephone events to cards.
Each person with cards has one telephone event. Its incoming card edges are
derived from ownership and cannot be manually removed. A person may have zero
through eight cards; an empty person's page is immediately complete.

Choose **Game mode** beside the flowchart details to switch between
**All cards unlocked** (the editor default for new flowcharts) and
**Directed progression**. New blank flowcharts and the first automatically
loaded flow use all-unlocked mode unless the loaded file explicitly specifies
a mode. Existing saved flowcharts, migrated drafts, imports, and selected
samples keep their authored gameplay behavior.
The all-unlocked mode needs no starting-card selection or directed unlock
conditions, and blank backs are allowed even on cards with authored unlock
links. The only required graph links are each card's automatic connection to
the telephone event with the same `personId`. Ownership, answer keys, card
fields, capacity, and reference validation still apply.
Existing starting selections and directed unlock links are preserved but
ignored in this mode, so switching back restores their progression behavior.
All cards display as starters, and their starting-status checkboxes are
disabled while this mode is selected.

In **Person View**, click a person's header to expand or collapse their name
editor, cards, and actions. Names, person IDs, and card counts stay visible when
collapsed, and multiple people can stay open. The selected card's owner, or the
first person, opens initially. Newly added people and a selected card's new
owner open automatically.

Choose a **Sample dataset** in the editor and click **Load sample** to replace
only the current flowchart's gameflow after confirmation. The dropdown includes
the original playable fictional careers and an all-unlocked
[Meisi CSV sample](public/sample_meisi_gameflow.json): 9 people, 53 cards, and 9
telephone events. The Meisi sample uses `"mode": "all-unlocked"`, so all 53 cards
start in the bin without starting-card selections or authored unlock conditions.
Only the automatic ownership-to-telephone links are generated.
Blank CSV roles remain blank and are optional, so this sample can be played
and exported without filling them in.
When the configured Google Sheet loads successfully, it is selected in the
sample dropdown and initializes a fresh editor, matching the game's default
dataset. Existing saved flowcharts and migrated drafts still restore normally.
Without a usable sheet, Meisi remains the default sample selection and the
game's startup fallback when `gameflow.json` is absent. Custom public files and
saved flowcharts keep their existing priority and data.

The first successful Google Sheets load is cached in the tab's `sessionStorage`,
keyed by spreadsheet ID and range, without storing API credentials or generating
a JSON file. The game and editor reuse that result across navigation and page
reloads rather than fetching it again. The editor adds it first in the sample
dataset list, including when restoring a saved flowchart, without replacing or
saving the open flowchart. Selecting it and clicking **Load sample** applies the
cached data. Clear the tab's session cache and reload to fetch updated data.
Cache failures show a warning but do not prevent a successfully fetched sheet
from being used.

The Meisi dataset is generated from [meisi-data.csv](meisi-data.csv) with
`npm run generate:meisi`. The generator and live Sheets loading share the
browser-safe CSV parser in [src/game/meisi.ts](src/game/meisi.ts).
Each `peopleID` becomes a person's `id`; the latest
card's display name is used for the person's name, while each card keeps its
own historical display name. `position` maps directly to `role`, `misc` and
`back` are joined with a newline into `misc`, and only `tegaki` becomes
`backText`. Logos, company IDs, and departments are retained; `fonts` is ignored.
Front details are editable in Person View and displayed when inspecting the
front of a card, independently of the back-text unlock action.
Add future dropdown entries to `SAMPLE_DATASETS` in
[src/game/files.ts](src/game/files.ts) and place their JSON in [public/](public/).

In **Flowchart View**, drag nodes to arrange events and use the zoom, pan, and
fit controls to navigate. Drag from an event's right-hand handle to a card's
left-hand handle to add a directed edge, or use **Selection / relations** in the
toolbar to open the source/target relation form. The canvas fills the editor
workspace; selecting a node or edge opens a floating selection editor instead
of reserving space for a sidebar. Close the popup with **X**, Escape, or a click
on empty canvas space.
Select nodes or solid edges and use **Delete selected nodes / edges**, Delete,
or Backspace to remove them. Dashed automatic card-to-telephone edges are
protected, including against keyboard deletion. Double-click a card to edit
its fields in Person View. Starting status can also be changed in the
flowchart's selection popup.

Adding a telephone can create a new person or use an empty person without a
telephone. Explicit telephone deletion shows a confirmation warning, removes
the person, and keeps their cards as unassigned drafts unless those cards are
also selected for deletion. Deleting a node removes every incoming and
outgoing edge. Deleting a person's last card automatically removes their
telephone and its edges but keeps the empty person; adding or assigning a card
to that person recreates a telephone with a new ID. Empty people without a
telephone remain valid and have no Call action in the game.

A bottom-right warning lists unreachable card and telephone events, even when
other draft fields are incomplete. It dismisses after five seconds, or sooner
with its **X** button, and pauses dismissal while focus is inside the warning
so its details can be read. It reappears when the unreachable event set changes
or another document is loaded, not for layout changes or unrelated edits.
Unreachable nodes stay highlighted after the warning disappears.
In directed progression mode, reachability uses the game's actual AND
requirements, card-back clues, and completed-page telephone prerequisites,
not just whether a visual path exists from a starting card.
In all-unlocked mode, every card is reachable immediately.

The editor saves each flowchart as a separate browser-local document under
`namecard-game.flowchart.v1.<id>.gameflow.json`, containing its ID, display title,
and independent `gameflow` JSON. The most recently opened ID is remembered;
`/editor?flowchart=<id>` opens a particular saved flowchart directly. An existing
single editor draft is migrated to **My flowchart** on first use and retained
in its old storage key as a backup.

Flowcharts belong to the current browser and origin, not to the server or a
user account. Download backups before clearing browser data or moving to
another browser. A failed local save keeps the current document open, warns
before leaving it, and blocks playback until saving succeeds. Import and
**Load public file** replace only the current flowchart's gameflow after
confirmation; its permanent ID and title stay unchanged.

Export downloads the open flowchart's `gameflow.json`; a browser cannot
overwrite repository files directly. Import the download in the game or copy it
into `public/` to publish a standalone game. Draft backups also contain only the
open flowchart and can include incomplete fields. Invalid or unobtainable flows
cannot be played or exported as playable games.

Cards named in validation errors are highlighted in red with an error badge
in Person View, Event View, and Flowchart View. The selected card's editing
panel is highlighted too. These highlights clear as soon as the relevant
validation issues are corrected, independently of unreachable-event warnings.

### JSON contract (version 1)

The normalized document contains:

```ts
{
  version: 1,
  mode?: 'progression' | 'all-unlocked',
  nextId: number,
  nextPersonId: number,
  nextNamecardId: number,
  nextTelephoneEventId: number,
  startingCards: number[],
  persons: { id: number, objectId: number, name: string, namecards: number[] }[],
  namecards: {
    id: number, objectId: number, personId: number, personDisplayName: string,
    company: string, role: string, year: number, misc: string, backText: string,
    logo?: string, companyId?: number | null, department?: string,
    unlocks: number[]
  }[],
  telephoneEvents: { id: number, objectId: number, personId: number, unlocks: number[] }[],
  eventPositions?: { [objectId: number]: { x: number, y: number } }
}
```

Person `namecards` entries reference the top-level cards rather than duplicating
them; this list is the answer key, sorted by year, with ID as the tie-breaker.
Cards have exactly one owner in a playable flow. Unassigned cards are allowed
only in an editor draft. Runtime back-viewing progress is tracked by the game's
`viewedBacks` collection rather than stored in the authored JSON.

Role text is optional for gameplay and export. Blank roles are preserved, and
an omitted `role` in imported JSON is normalized to an empty string. Company
and display name remain required.

The optional `eventPositions` map stores flowchart positions by card or
telephone `objectId`. Coordinates may be fractional or negative, but must be
finite numbers. Layout survives local saving, draft backups, and gameflow
export/import; older files without positions receive a default layout.
Positions do not affect gameplay, and deleting an event removes its position.

People, namecards, and telephones each have an independent nonnegative `id`
sequence, starting at 0 in a new flowchart. Their persisted counters are
`nextPersonId`, `nextNamecardId`, and `nextTelephoneEventId`. The same numeric
`id` may belong to a person, a card, and a telephone without a collision.
`personId`, person answer keys, and `startingCards` reference these type-specific
IDs. Every entity also has a globally unique `objectId`; `nextId` allocates
these global IDs. All counters survive deletion so IDs are never reused.

Flowchart nodes, `eventPositions`, and every `unlocks` entry use `objectId`,
not the type-specific `id`. A card's `unlocks` contains destination card
object IDs plus its owner's telephone object ID. Telephone `unlocks` contains
only card object IDs. The automatic card-to-telephone edges mean
"file this person's complete history", not "read all card backs".

Older version-1 JSON and saved flowcharts remain readable: a missing
`objectId` is initialized from the original globally unique `id`, missing
per-type counters start at the legacy `nextId`, and missing `misc` becomes
empty text. Existing references, positions, and progress semantics are
preserved; subsequent saves/export include the expanded fields.

The optional `mode` defaults to `'progression'` when omitted, preserving older
files. New editor flowcharts explicitly store `"mode": "all-unlocked"`.
Set `"mode": "all-unlocked"` to start with every namecard owned and in the
bin, regardless of `startingCards` or incoming unlock links. `startingCards`
remains an array (which may be empty); saved starting selections and unlock
links are retained. The mode survives local saving, export/import, and restart.

In progression mode, starting cards are owned unconditionally. Every other card
requires one or more incoming card-back/call conditions, combined with **AND**. A card that unlocks
another card must have nonblank back text. The validator rejects duplicate IDs,
missing references, ownership inconsistencies, stale answer keys, overfull
pages, and unreachable conditions (including telephone deadlocks). It permits
cycles only if the starting cards make every card obtainable.

## Original grid demo

Drag namecards to reorder them, or focus a card and press Space, use the arrow
keys, and press Space again to drop it. Escape cancels a drag. Mouse, touch, and
keyboard input are supported.

The demo controls set the column count, index order, and horizontal direction.
Changing the layout does not reorder the underlying cards. Narrow screens scroll
the grid horizontally rather than reducing the requested number of columns.

## ReorderableGrid

```tsx
import ReorderableGrid from './components/ReorderableGrid'

<ReorderableGrid
  cards={cards}
  onReorder={setCards}
  columns={3}
  order="column-wise"
  direction="rtl"
/>
```

- `cards`: the ordered `Namecard[]`; each card must have a unique `id`.
- `onReorder`: receives the new array after a drop, moving the dragged card to the
  target index and shifting the intervening cards.
- `columns`: positive safe integer, default `1`. Invalid values throw a
  `RangeError`.
- `order`: `'row-wise'` (default) fills each row before advancing downward;
  `'column-wise'` fills each column top-to-bottom before advancing horizontally.
- `direction`: `'ltr'` (default) or `'rtl'`; controls column progression, not text
  direction or the underlying array order.

Column-wise layouts use `Math.ceil(cards.length / columns)` rows. With seven
cards and three columns, the column sizes are 3, 3, and 1 in the chosen direction.
Unused cells (or entire columns) remain empty at the end. DOM and keyboard tab
order follow the array; arrow keys during a drag follow the visual grid.

`ReorderableColumn` remains available as a compatibility export. Omitting the new
props preserves the single-column layout and vertical-only dragging.

## Local people dataset

[src/data/people.ts](src/data/people.ts) exports a typed `Person[]` named `people`,
bundled locally with the app. All people and companies are fictional. It contains
eight people and 27 business cards, using the existing `Person` and `Namecard`
models with globally unique card IDs.

Each person's card count was randomly drawn once from 1 through 8 and saved in
the fixture, so reloads do not regenerate their history. Cards initially run
from earliest to latest year, with related roles, promotions, and company moves.

| Person | Cards | Starting role | Year |
| --- | ---: | --- | ---: |
| Mara Venn | 3 | 6502 Game Programmer | 1982 |
| Jonas Bellwick | 7 | Game Designer | 1982 |
| Leila Arden | 2 | Pixel Artist | 1983 |
| Tomas Reedwell | 2 | Game Music Composer | 1983 |
| Nia Calder | 3 | Game Tester | 1984 |
| Elias Fenwick | 1 | Electronics Technician | 1985 |
| Priya Solmere | 7 | Print Designer | 1986 |
| Owen Ashcroft | 2 | Accounts Assistant | 1987 |

The first five begin at Lantern Byte Games, covering programming, design, art,
music, and testing for an early video-game team. The remaining three begin
outside game development.

Choose a person in the demo to view their cards, including the year on each
card. Reordering affects only that person and is retained when switching people
within the current page session. Reloading restores the fixture; this is a
bundled dataset, not a writable database or browser-persisted store.

## HTTP requests

[src/network/http.ts](src/network/http.ts) exports `request`, a small wrapper
around native `fetch`. It accepts a URL string, `URL`, or `Request`, plus
standard `RequestInit` options such as methods, headers, bodies, credentials,
and abort signals. It returns an unread `Response`, so callers choose whether
to read JSON, text, or another format. Empty successful responses are supported.

For example, from a module under `src/`:

```ts
import { request } from './network/http.ts'
import { appUrl } from './urls.ts'

const response = await request(appUrl('sample_meisi_gameflow.json'))
const data: unknown = await response.json()

await request('/api/example', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello' }),
})
```

Replace `/api/example` with your backend endpoint; this helper does not create
server routes or bypass browser CORS rules. Use `appUrl` for bundled public
files so deployment base paths are respected.

Non-2xx responses throw `HttpError`. Its `response` exposes the status,
headers, and unread error body, and its message supports the existing
localization helpers. Network failures and abort errors propagate unchanged.

### Google Sheets as CSV

[src/network/googleSheets.ts](src/network/googleSheets.ts) exports
`getGoogleSheetCsv`, also available as `loadFromSpreadsheet` from
[src/game/files.ts](src/game/files.ts). It calls the
[Sheets values.get API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get)
and converts its JSON rows into a CSV string:

```ts
import { getGoogleSheetCsv } from './network/googleSheets.ts'

const controller = new AbortController()
const csv = await getGoogleSheetCsv({
  spreadsheetId: 'YOUR_SPREADSHEET_ID',
  range: "'Name Cards'!A1:L",
  apiKey: 'YOUR_API_KEY',
  signal: controller.signal,
})
```

The game startup reads these settings from `.env.local` in the project root:

```dotenv
VITE_GOOGLE_SHEETS_API_KEY=YOUR_API_KEY
VITE_SPREADSHEET_ID=YOUR_SPREADSHEET_ID
VITE_SPREADSHEET_NAME="'Name Cards'!A1:L"
```

Vite only exposes `VITE_`-prefixed environment variables to browser code.
Restart the dev server after changing them. On the home game, startup uses
the fetched CSV as the top default gameflow, with all cards unlocked.
The CSV must have the same headers and mappings as
[meisi-data.csv](meisi-data.csv).
Explicit saved-flowchart play links bypass Sheets. With no Sheets settings,
startup uses the local defaults; partial or invalid settings produce a
visible warning and a local fallback. Imported JSON and the editor's saved
flowcharts are not replaced by the live default.

Use the ID between `/d/` and `/edit` in the spreadsheet URL, and an A1 range
or tab name. The numeric `gid` from an export URL is not an A1 range.
Enable the Google Sheets API for the credentials' project. An API key can
read publicly shared sheets; for private sheets, pass `accessToken` instead
of `apiKey`, obtained through OAuth with a scope such as
`https://www.googleapis.com/auth/spreadsheets.readonly`.
The helper does not perform OAuth sign-in or obtain credentials.
Do not commit real credentials; restrict browser API keys appropriately and
never put a service-account private key in browser code.

The helper requests row-based, formatted values. CSV fields containing commas,
quotes, or line breaks are escaped; short rows are padded to the widest
returned row. Records use CRLF endings, including a final ending for nonempty
results. Empty ranges return an empty string. Google omits trailing empty rows
and columns, so the CSV represents the returned data rather than the unused
sheet grid. Pass a caller-owned abort signal to cancel the request; API
permission errors remain `HttpError`s with the Google response available.
Credentials are sent in headers rather than included in the request URL.

## Development

The card inspection dialog lives in [src/components/CardInspection.tsx](src/components/CardInspection.tsx),
while [src/game/GameApp.tsx](src/game/GameApp.tsx) owns card selection and game actions.

- `npm run dev`: start the demo.
- `npm run build`: type-check and create a production build.
- `npm run lint`: run Oxlint.
- `npm run generate:meisi`: regenerate the all-unlocked CSV sample after changing its source.
- `npm test`: run localization, gameflow, sample-dataset, saved-flowchart storage/playback, game rules, editor, grid-layout, and fixture tests using Node's built-in test runner
  and TypeScript stripping (Node 22.6+).

### Deployment URLs

Local development keeps the `/`, `/editor`, and `/demo` routes described above.
Production builds use `/namecard-demo/` as their base, configured in
[vite.config.ts](vite.config.ts). Run `npm run preview` and open
[http://localhost:4173/namecard-demo/](http://localhost:4173/namecard-demo/)
to check the production build. Navigation links, saved-flowchart play URLs,
and public JSON requests all use Vite's `BASE_URL`.

GitHub Pages does not provide an SPA routing fallback. The
[deployment workflow](.github/workflows/deploy.yml) copies the built
`dist/index.html` into `dist/editor/index.html` and `dist/demo/index.html` so
direct visits and refreshes of `/namecard-demo/editor/` and
`/namecard-demo/demo/` work.

### Publishing to GitHub Pages

1. In the GitHub repository, open **Settings > Pages** and set **Source** to
   **GitHub Actions**.
2. Commit all application and workflow files, including the
   [URL helper](src/urls.ts), and push to `master`.
3. Wait for **Deploy to GitHub Pages** in the repository's **Actions** tab to
   finish. The site will be available at
   [https://nyuru-nyuru.github.io/namecard-demo/](https://nyuru-nyuru.github.io/namecard-demo/).

Every push to `master` rebuilds and deploys the site. You can also run the
workflow manually from the Actions tab. Deployment uses GitHub's automatic
`GITHUB_TOKEN`; no personal access token or deployment secret is required.

For the [Google Sheets startup settings](#google-sheets-as-csv), add repository
secrets under **Settings > Secrets and variables > Actions** with these names:
`VITE_GOOGLE_SHEETS_API_KEY`, `VITE_SPREADSHEET_ID`, and
`VITE_SPREADSHEET_NAME`. The workflow passes them to Vite's build step; changing
their values requires another deployment. The local `.env.local` file is not
uploaded. These `VITE_` values are included in the public JavaScript bundle, so
use a restricted browser API key, never private credentials.

Browser-local flowcharts are not uploaded by deployment. To publish a custom
default game, export it from the editor, save it as `gameflow.json` in
[public/](public/), and commit it before pushing. Configured Google Sheets take
priority over this public file; without either source, visitors play the
included sample gameflow.

## Vite template notes

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
