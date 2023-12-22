import assert from "assert"
import type { PlasmoCSConfig } from "plasmo"
import { setupSync } from "~sync"
import { findReact, findStore } from "~utils"

export const config: PlasmoCSConfig = {
  matches: ["https://www.nytimes.com/crosswords/game/*"],
  all_frames: true,
  world: "MAIN"  // required for some reason for findReact to work properly
}

let store = null

// Called when store is set to a non-null value.
function initialize() {
  assert(store !== null && store !== undefined)
  console.log("store initialized")
  console.log(store)

  store.subscribe(() => {
    const state = store.getState();
    console.log("current selection:", state.selection.cell)
  })

  // register a callback to run when the control key is pressed
  document.addEventListener("keydown", (e) => {
    if (e.key === "Control") {
      console.log("control key pressed")
      store.dispatch({
        type: "crossword/cell/GUESS",
        payload: {
          blankDelta: 0,
          incorrectDelta: 0,
          index: 0,
          inPencilMode: false,
          autocheckEnabled: false,
          value: "C",
          fromRebus: false,
          now: 1703204055
        }
      })
    }
  })

  const room = setupSync()
  console.log("room initialized")
  room.onPeerJoin(peerId => console.log(`${peerId} joined`))
  room.onPeerLeave(peerId => console.log(`${peerId} left`))
}

// callback using mutation observer
const callback = (mutationsList: MutationRecord[]) => {
  if (store !== null) {
    return
  }

  const parent = document.querySelector("main")
  const reactNode = findReact(parent)
  const state = reactNode?.memoizedState
  store = findStore(state)
  initialize()
}

// create an observer instance
const observer = new MutationObserver(callback)

// start observing
observer.observe(document.body, {
  childList: true,
  attributes: true,
  subtree: true
})
