### Business card filing game

## Tech stack:
ReactJS with Typescript

## Gameplay Overview
This project is a game where the main pieces on screen are a bin of various business cards, represented by `Namecard`, in a disorganized pile, and an open binder displaying 2-page spreads of 2x8 columns of business card-sized slots. 

The user can drag a card from the bin into a slot in the binder, reorder cards in the binder via drag-and-drop, and drag cards from the binder back into the bin. If the card is released mid-drag outside of the binder, it is automatically moved to the bin.

The binder will have one page for each `Person` in the game. `Persons.namecards` is an array of `Namecard` that belong to the `Person`, sorted in ascending order by year. This is the answer key for business cards that should go on a `Person`'s page on the binder and the order they should be in.

The user can click on a card in either the binder or bin to get a full view of the card shown on top of the main game screen. There is a button the user can click to show the back of the card, which may be blank or contain information that satisfies an unlock condition for a card that the user does not own. Upon viewing this information, the user is considered to have satisfied the unlock condition. A card can have 1 or more unlock conditions to unlock. When unlocked, it is placed into the bin of cards.

## Functional requirements
- All interface text is keyed in English and Japanese JSON catalogs. A shared English/Japanese toggle is available in the game, editor, and demo, with a browser-local preference. Switching languages preserves current progress and editor state; namecard content and character names remain unchanged.
- User can look at back of card to satisfy an unlock condition for a card
- User obtains a new card once all of that card's unlock conditions have been viewed
- User must be able to drag cards from the bin to one of the two currently open pages in the binder, and drag cards from the binder back to the bin
- User must be able to reorder cards in the binder via drag and drop
- User can flip through pages in the binder
- When a `Person`'s cards are all present on their page arranged in ascending order by year, this person's cards are locked in place (placement in page on binder cannot be modified), but they can still be viewed by clicking on them.
- When a `Person`'s namecards are locked in place, the telephone button will be enabled and the user will be able to call the Person. This action will satisfy one or more unlock conditions for cards not currently in the user's possession.


## Game state
The game will begin with a set number of cards in the bin, and a page in the binder for each `Person` defined. As the user views information on the cards or calls a `Person` , they will satisfy unlock conditions for cards that are not currently in their possession. 
The user can drag and drop cards into the binder, and on each board state change it will check if the cards currently on the binder are an exact match with the corresponding `Person`'s `namecards`.
The game reaches an ending state when all namecards are locked in place under the person they belong to in the correct order of ascending year.

The starting set of cards, `Person` objects, card unlock conditions, are read from a json file `gameflow.json`
If `gameflow.json` doesn't exist, generate a sample `sample_gameflow.json` consisting of 8 `Persons`, 5 starting cards each belonging to a different person, and 40 cards total. All cards must be obtainable.

## Game state Editor
The game state editor is a separate app that allows the user to edit `gameflow.json`. The editor allows the user to create the following entities:
- `Namecard`: allows user to fill in the company, year, personDisplayName, role, misc (front-side card details), backText (text on the back), and generates a unique id (starting at 0 and incremented for each `Namecard` generated) for the card. Logo, department, and companyId may also be retained.
- `Person`: A person in the game, who has 0-8 `Namecard` associated with them. Each `Namecard` can only be associated with one person. A unique id is generated upon creation. `Namecard`s associated with a `Person` will have the `personId` automatically filled out with the `Person`'s id.
- `Person`, `Namecard`, and `TelephoneEvent` have independent incremental `id` counters. Every entity also has a globally unique `objectId`, allocated by `nextId`, for flowchart nodes, layout positions, and unlock references. `personId`, answer keys, and starting cards use type-specific ids. Counters are persisted and never reuse deleted ids. Legacy files without objectId use their original global id as objectId and retain all references.
- A directed edge from one `Namecard` to another `Namecard`, denoting that the source is a unlock condition for the destination. A `Namecard` can have multiple unlock conditions, and be the condition for unlocking 0 or more `Namecard`
- A `TelephoneEvent`, referencing a `Person`. The unlock condition is always all `Namecard`s belonging to that `Person`
- An editor-only sample dataset dropdown can load either the original playable sample or an unwired sample generated from `meisi-data.csv`. The CSV produces 9 people (using peopleID as id), 53 cards, and 9 telephone events, with no starters or authored unlock links. Automatic ownership links are retained. The position column maps to role, misc and back are joined into misc, and tegaki maps to backText. Fonts are ignored; blank roles and historical display names are preserved.

The game editor can have 2 views: 

# Person View
Shows every `Person` and the `Namecard`s belonging to them, in order

# Event View
Shows every `Namecard`, `TelephoneEvent` and their directed relations. A `TelephoneEvent` is always pointed to by all `Namecard` associated with the same `Person`.

# Export 
Exports a `json` file consisting of each `Namecard`, `Person`, `TelephoneEvent` and the global/per-type counters. Each `Namecard` and `TelephoneEvent` has a field `unlocks` (type: array) listing all the `objectId`s of `Namecard`s they unlock. By default, each `Namecard` will have the `objectId` of the `TelephoneEvent` with a matching `Person` id in their `unlocks`.
