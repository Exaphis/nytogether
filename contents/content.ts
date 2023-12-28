import type { PlasmoCSConfig } from "plasmo"

import { setupSync, updateStoreState, type Cell } from "~sync"

export const config: PlasmoCSConfig = {
  matches: ["https://www.nytimes.com/crosswords/game/*"],
  all_frames: true
}

function setCell(cellId: number, cell: Cell) {
  const event = new CustomEvent("nytogether-store-fillCell", {
    detail: {
      cell,
      cellId
    }
  })
  window.dispatchEvent(event)
}

async function initialize(storeState) {
  let hash = `${storeState.gameData.filename}/test` //window.location.hash.slice(1)

  async function onSetSelection(
    prevCellId: number | null,
    cellId: number | null
  ) {
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

  setupSync(
    storeState,
    onSetSelection,
    async (cellId, cell) => {
      setCell(cellId, cell)
    },
    hash
  )
}

window.addEventListener("nytogether-store", (e: CustomEvent) => {
  // store state is sent by the main world page script
  const storeState = e.detail
  initialize(storeState)
  updateStoreState(storeState)
})
