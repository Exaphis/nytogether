import assert from "assert"
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://www.nytimes.com/crosswords/game/*"],
  all_frames: true
}

let store = null

// Called when store is set to a non-null value.
function initialize() {
  assert(store !== null)
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
}

// callback using mutation observer
const callback = (mutationsList: MutationRecord[]) => {
  if (store !== null) {
    return
  }

  // https://stackoverflow.com/a/39165137/6686559
  function findReact(dom, traverseUp = 0) {
    const key = Object.keys(dom).find((key) => {
      return (
        key.startsWith("__reactFiber$") || // react 17+
        key.startsWith("__reactInternalInstance$")
      ) // react <17
    })
    const domFiber = dom[key]
    if (domFiber == null) return null

    // react <16
    if (domFiber._currentElement) {
      let compFiber = domFiber._currentElement._owner
      for (let i = 0; i < traverseUp; i++) {
        compFiber = compFiber._currentElement._owner
      }
      return compFiber._instance
    }

    // react 16+
    const GetCompFiber = (fiber) => {
      let parentFiber = fiber.return
      while (typeof parentFiber.type == "string") {
        parentFiber = parentFiber.return
      }
      return parentFiber
    }
    let compFiber = GetCompFiber(domFiber)
    for (let i = 0; i < traverseUp; i++) {
      compFiber = GetCompFiber(compFiber)
    }
    return compFiber
  }

  // first, get all cell's contents
  const parent = document.querySelector("g[data-group=cells]")
  const reactElem = findReact(parent)
  store = reactElem?.memoizedState.next.memoizedState[1][0]
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
