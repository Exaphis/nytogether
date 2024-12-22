# NYTogether

[<div align="center"><img src="https://i.imgur.com/r7gehrt.png" alt="Available in the Chrome Web Store" width="250"></div>](https://chromewebstore.google.com/detail/nytogether/jffmdpeogammpanehehiojklbepkefkn)

NYTogether is a browser extension that lets you collaborate with your friends on [New York Times crossword puzzles](https://www.nytimes.com/crosswords) directly on the site.

This lets you track your progress and streaks directly using the New York Times interface. If staying on the site is not necessary for you, [Down for a Cross](https://downforacross.com/) is likely a better option.

![NYTogether](images/NYTogther%201.png)

## Usage

1. Install the extension
2. Open a New York Times crossword puzzle page
3. Click the extension icon
4. Set your room name the same as your friend's
5. Choose a username
6. Click "Join room"
7. Start solving the puzzle!

If you check "Auto join", future crossword puzzles you open will automatically join the room with the same username. This is useful if you always solve puzzles with the same person.

## How does it work?

The extension is built with [WXT](https://wxt.dev/). A content script is injected into the New York Times crossword puzzle page, which observes the underlying Redux store and synchronizes state with other clients using [Firebase Realtime Database](https://firebase.google.com/products/realtime-database).

## Development

Clone the repo and run `pnpm install` to install the dependencies.

Start the development server with `pnpm dev`.

### Firebase structure

The Firebase realtime database is structured as follows:

-   `xwords`: All crossword rooms.
    -   `{roomId}`: A crossword room. Room IDs are in the format `{name}-{puzzle ID}`.
        -   `createdAt`: The date the room was created.
        -   `updatedAt`: The date a guess in the room was last updated.
-   `members`: All members.
    -   `{roomId}`: All members in the room.
        -   `{name}`: The name of the user. (name -> userId to allow multiple joins from the same user for testing)
            -   `userId`: The user ID of the user who set this name.
            -   `selection`: The cursor position (board index) of the user.
-   `guesses`: All guesses.
    -   `{roomId}`: All guesses in the room.
        -   `{idx}`: A guess for the cell at `idx`.
            -   `letter`: The letter of the guess.
            -   `penciled`: Whether the guess was made with a pencil.
            -   `userId`: The user ID of the user who made the guess.
            -   `timestamp`: The timestamp the guess was made.
