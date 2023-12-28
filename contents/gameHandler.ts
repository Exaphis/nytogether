import { once } from "lodash"
import type { PlasmoCSConfig } from "plasmo"

import { findReact, findStore } from "~utils"

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
window.addEventListener("nytogether-store-fillCell", (event: CustomEvent) => {
  const {
    cell: { guess, penciled },
    cellId
  } = event.detail

  const storeState = currStore.getState()
  const prevSelection = storeState.selection.cell

  currStore.dispatch({
    type: "crossword/selection/SELECT_CELL",
    payload: {
      index: cellId
    }
  })

  const inPencilMode = currStore.getState().toolbar.inPencilMode

  if (penciled !== inPencilMode) {
    currStore.dispatch({
      type: "crossword/toolbar/TOGGLE_PENCIL_MODE"
    })
  }

  // Select the button with aria-label="Rebus"
  const rebusButton = document.querySelector(
    '[aria-label="Rebus"]'
  ) as HTMLButtonElement
  rebusButton.click()

  const rebusInput = document.querySelector("#rebus-input") as HTMLInputElement
  triggerInputChange(rebusInput, guess)
  // Save the change by calling the onBlur handler
  for (const key of Object.keys(rebusInput)) {
    if (key.startsWith("__reactEventHandlers$")) {
      rebusInput[key].onBlur()
      break
    }
  }

  if (penciled !== inPencilMode) {
    currStore.dispatch({
      type: "crossword/toolbar/TOGGLE_PENCIL_MODE"
    })
  }

  currStore.dispatch({
    type: "crossword/selection/SELECT_CELL",
    payload: {
      index: prevSelection
    }
  })
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
