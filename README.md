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

## Playing the game

The binder shows two person pages side by side. Each page has two columns and
four rows (eight pockets), making a four-column, four-row spread. Pocket order
runs left to right, then top to bottom within each person's page.
Inspect cards in the bin or binder and choose **Show back** to discover leads.
The inspection card flips in 3D; reduced-motion preferences disable the animation.
Drag cards into pockets, swap occupied pockets, or drag them outside the binder
to return them to the bin. When a bin card replaces an occupied pocket, the
displaced card returns to the bin. For keyboard or tap-only play, inspect a card,
choose **Choose a binder slot**, then **Place here** on either open page.
Escape cancels an active drag or closes the inspection dialog.
You can also close the inspection with the top-right **X** or **Close card** button.

A history locks only when every expected card is in its exact chronological
position starting at pocket 1, with no gaps or extra cards. Locked cards remain
inspectable. The person's **Call** button then becomes available. Viewing a
card back and calling a person are separate actions; all incoming unlock
conditions for a new card must be satisfied. New cards appear in the bin.
Complete every page to reach the ending. Game progress lasts until reload or
restart; loading a new flow also starts a new game.

All namecards (bin, binder pockets, inspection view, drag preview, the editor's
person-view tiles, and the grid demo) share one width:height ratio, 216:118,
defined once as `--card-aspect-ratio` in [src/index.css](src/index.css). On
narrow screens the binder spread scrolls horizontally, keeping both pages in
the same four-column, four-row layout without squeezing or stretching cards.

## Loading and authoring gameflows

Place a custom `gameflow.json` in [public/](public/) to load it at startup. When
that file is absent, the game loads the included
[sample_gameflow.json](public/sample_gameflow.json): eight fictional people,
40 cards, and five starters belonging to different people. Every card is
obtainable, including introductions requiring two completed-page calls.
Malformed files and invalid graphs show errors rather than silently switching
to the sample. You can also import a JSON file directly in the game.

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
cards, edit front/back text, and connect card-back or telephone events to cards.
Each person with cards has one telephone event. Its incoming card edges are
derived from ownership and cannot be manually removed. A person may have zero
through eight cards; an empty person's page is immediately complete.

In **Flowchart View**, drag nodes to arrange events and use the zoom, pan, and
fit controls to navigate. Drag from an event's right-hand handle to a card's
left-hand handle to add a directed edge, or use the source/target relation form.
Select nodes or solid edges and use **Delete selected nodes / edges**, Delete,
or Backspace to remove them. Dashed automatic card-to-telephone edges are
protected, including against keyboard deletion. Double-click a card to edit
its fields in Person View. Starting status can also be changed in the
flowchart's selection panel.

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
Reachability uses the game's actual AND
requirements, card-back clues, and completed-page telephone prerequisites,
not just whether a visual path exists from a starting card.

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

### JSON contract (version 1)

The normalized document contains:

```ts
{
  version: 1,
  nextId: number,
  startingCards: number[],
  persons: { id: number, name: string, namecards: number[] }[],
  namecards: {
    id: number, personId: number, personDisplayName: string,
    company: string, role: string, year: number, backText: string,
    unlocks: number[]
  }[],
  telephoneEvents: { id: number, personId: number, unlocks: number[] }[],
  eventPositions?: { [eventId: number]: { x: number, y: number } }
}
```

Person `namecards` entries reference the top-level cards rather than duplicating
them; this list is the answer key, sorted by year, with ID as the tie-breaker.
Cards have exactly one owner in a playable flow. Unassigned cards are allowed
only in an editor draft. Runtime back-viewing progress is tracked by the game's
`viewedBacks` collection rather than stored in the authored JSON.

The optional `eventPositions` map stores flowchart positions by card or
telephone event ID. Coordinates may be fractional or negative, but must be
finite numbers. Layout survives local saving, draft backups, and gameflow
export/import; older files without positions receive a default layout.
Positions do not affect gameplay, and deleting an event removes its position.

All three entity types share one nonnegative incremental ID sequence starting
at 0. `nextId` is persisted so deletion does not reuse IDs. A card's `unlocks`
contains destination card IDs plus its owner's telephone-event ID. Telephone
`unlocks` contains only card IDs. The automatic card-to-telephone edges mean
"file this person's complete history", not "read all card backs".

Starting cards are owned unconditionally. Every other card requires one or more
incoming card-back/call conditions, combined with **AND**. A card that unlocks
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

## Development

The card inspection dialog lives in [src/components/CardInspection.tsx](src/components/CardInspection.tsx),
while [src/game/GameApp.tsx](src/game/GameApp.tsx) owns card selection and game actions.

- `npm run dev`: start the demo.
- `npm run build`: type-check and create a production build.
- `npm run lint`: run Oxlint.
- `npm test`: run gameflow, saved-flowchart storage/playback, game rules, editor, grid-layout, and fixture tests using Node's built-in test runner
  and TypeScript stripping (Node 22.6+).

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
