import assert from "assert"
import type { PlasmoCSConfig } from "plasmo"

import { setupSync, updateStoreState, type Cell } from "~sync"
import { findReact, findStore } from "~utils"

export const config: PlasmoCSConfig = {
  matches: ["https://www.nytimes.com/crosswords/game/*"],
  all_frames: true,
  world: "MAIN" // required for some reason for findReact to work properly
}

let initialized = false
let store = null

// Called when store is set to a non-null value
// or when the hash changes (i.e. the share button is clicked)
export function initialize() {
  const hash = window.location.hash.slice(1)
  if (store === null || hash === '' || initialized) {
    return
  }
  initialized = true
  console.log("store initialized")
  console.log(hash)
  console.log(store.getState())

  store.subscribe(() => {
    updateStoreState(store.getState())
  })

  function onSetCell(cellId: number, cell: Cell) {
    const prevSelection = store.getState().selection.cell
    store.dispatch({
      type: "crossword/cell/GUESS",
      payload: {
        blankDelta: 0,
        incorrectDelta: 0,
        index: cellId,
        inPencilMode: cell.penciled,
        autocheckEnabled: false,
        value: cell.guess,
        fromRebus: false,
        now: Math.floor(Date.now() / 1000)
      }
    })
    store.dispatch({
      type: "crossword/selection/SELECT_CELL",
      payload: {
        index: prevSelection
      }
    })
  }

  function onSetSelection(
    peerId: string,
    prevCellId: number | null,
    cellId: number | null
  ) {
    console.log("setting selection")
    console.log(peerId)
    console.log(prevCellId)
    console.log(cellId)

    const cellElems = document.querySelectorAll(".xwd__cell")
    function setCellFill(targetCellId: number, fill: string | null) {
      const cellElem = cellElems[targetCellId]
      const inputElem = cellElem.querySelector("rect")
      if (fill === null) {
        inputElem.style.removeProperty("fill")
      } else {
        inputElem.style.fill = fill
      }
    }

    if (prevCellId !== null) {
      setCellFill(prevCellId, null)
    }
    if (cellId !== null) {
      setCellFill(cellId, "greenyellow")
    }
  }

  setupSync({
    state: store.getState(),
    onInitialize: (cells) => {
      console.log("initializing")
      console.log(cells)
      for (let i = 0; i < cells.length; i++) {
        onSetCell(i, cells[i])
      }
    },
    onSetSelection: onSetSelection,
    onSetCell: onSetCell,
    roomName: hash
  })
}

window.addEventListener("hashchange", initialize)

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
