import { once } from "lodash"
import type { PlasmoCSConfig } from "plasmo"

import { customEventListen, findReact, findStore } from "~utils"

// Content script lives in the MAIN world.
// Responsible for finding the Redux store using React internals.
// Passes the store events to the background script as the store object itself
// cannot be passed https://stackoverflow.com/a/53914790/6686559
// Uses events: https://stackoverflow.com/a/26740141/6686559
export const config: PlasmoCSConfig = {
  matches: ["https://www.nytimes.com/crosswords/game/*"],
  all_frames: true,
  world: "MAIN"
}

// Use the store to fetch the current game state (cell values,
// selection, etc.)
let currStore = null

const initialize = once((store) => {
  console.log("initializing store")
  console.log(store)
  currStore = store

  store.subscribe(() => {
    const state = store.getState()
    state.gameData = (window as any).gameData
    const event = new CustomEvent("nytogether-store", {
      detail: state
    })
    window.dispatchEvent(event)
  })
})

const triggerInputChange = (node: HTMLInputElement, inputValue: string) => {
  // https://stackoverflow.com/a/46012210/6686559
  var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set
  nativeInputValueSetter.call(node, inputValue)

  var ev2 = new Event("input", { bubbles: true })
  node.dispatchEvent(ev2)
}

// We can't simply dispatch actions to the store to update cell values
// as stuff like win checking is done in the event handler.
//
// For some reason, dispatchEvent doesn't work either.
// https://stackoverflow.com/q/39065010/6686559
//
// We could use the Chrome debugger to inject keyboard events, but that's
// a bit hacky and shows an ominous warning banner.
//
// Instead, we use the rebus function to fill in the cell.

// TODO: buffer fillCells if they are called while rebus is currently being
//       inputted manually, or restore rebus state
customEventListen(window, "nytogether-store-fillCell", (detail) => {
  const {
    cell: { guess, penciled },
    cellId,
    nytogetherDiffVersion
  } = detail

  function callOnBlur(node: HTMLInputElement) {
    for (const key of Object.keys(node)) {
      if (key.startsWith("__reactEventHandlers$")) {
        node[key].onBlur()
        break
      }
    }
  }

  const storeState = currStore.getState()
  const prevSelection = storeState.selection.cell
  const inPencilMode = storeState.toolbar.inPencilMode

  // TODO: restore rebus selection state (cursor position, selection if any)
  const inRebusMode = storeState.toolbar.inRebusMode
  const rebusContents = storeState.toolbar.rebusValue
  if (inRebusMode) {
    const selectedCellGuess = storeState.cells[prevSelection].guess
    const rebusInput = document.querySelector(
      "#rebus-input"
    ) as HTMLInputElement
    triggerInputChange(rebusInput, selectedCellGuess)
    // Save the change by calling the onBlur handler
    callOnBlur(rebusInput)
  }

  // First, select the cell to change
  currStore.dispatch({
    type: "crossword/selection/SELECT_CELL",
    payload: {
      index: cellId
    }
  })

  // Then, toggle pencil mode if needed
  if (penciled !== inPencilMode) {
    currStore.dispatch({
      type: "crossword/toolbar/TOGGLE_PENCIL_MODE"
    })
  }

  // Then, enable rebus mode
  // Select the button with aria-label="Rebus"
  const rebusButton = document.querySelector(
    '[aria-label="Rebus"]'
  ) as HTMLButtonElement
  rebusButton.click()

  const rebusInput = document.querySelector("#rebus-input") as HTMLInputElement
  triggerInputChange(rebusInput, guess)
  // Save the change by calling the onBlur handler
  callOnBlur(rebusInput)

  // Re-toggle pencil mode if we changed it
  if (penciled !== inPencilMode) {
    currStore.dispatch({
      type: "crossword/toolbar/TOGGLE_PENCIL_MODE"
    })
  }

  // Restore the selected cell
  currStore.dispatch({
    type: "crossword/selection/SELECT_CELL",
    payload: {
      index: prevSelection
    }
  })

  if (inRebusMode) {
    rebusButton.click()
    const rebusInput = document.querySelector(
      "#rebus-input"
    ) as HTMLInputElement
    triggerInputChange(rebusInput, rebusContents)
  }

  // See content.ts for an explanation of why this is necessary.
  // This uses a custom setting to set a variable in the store.
  currStore.dispatch({
    type: "crossword/user/CHANGE_SETTING",
    payload: {
      nytogetherDiffVersion
    }
  })
  console.log(
    "set cell, value: %s, new version: %d",
    guess,
    nytogetherDiffVersion
  )
})

customEventListen(window, "nytogether-store-resetDiffVersion", (detail) => {
  const nytogetherDiffVersion = detail
  currStore.dispatch({
    type: "crossword/user/CHANGE_SETTING",
    payload: {
      nytogetherDiffVersion
    }
  })
  console.log("reset diff version to %d", nytogetherDiffVersion)
})

async function callback(mutationsList: MutationRecord[]) {
  const parent = document.querySelector("main")
  const reactNode = findReact(parent)
  const state = reactNode?.memoizedState
  const store = findStore(state)

  if (store === null) {
    return
  }
  initialize(store)
}

// callback using mutation observer
// create an observer instance
const observer = new MutationObserver(callback)

// start observing
observer.observe(document.body, {
  childList: true,
  attributes: true,
  subtree: true
})
