import type { PlasmoCSConfig } from "plasmo"

import { listen } from "@plasmohq/messaging/message"
import { Storage } from "@plasmohq/storage"

import { setupSync, updateStoreState, type Cell, getSyncState } from "~sync"

export const config: PlasmoCSConfig = {
  matches: ["https://www.nytimes.com/crosswords/game/*"],
  all_frames: true
}

const storage = new Storage()
let currStoreState = null

listen(async (req, res) => {
  if (req.name === "nytogether-msg-joinGame") {
    initialize(currStoreState)
  }
  else if (req.name === "nytogether-msg-getRoom") {
    const syncState = getSyncState()
    const expectedPrefix = `${currStoreState.gameData.filename}/`
    if (!syncState.roomName.startsWith(expectedPrefix)) {
      syncState.roomName = syncState.roomName.slice(expectedPrefix.length)
    }
    res.send(syncState)
  }
})

function setCell(cellId: number, cell: Cell) {
  const event = new CustomEvent("nytogether-store-fillCell", {
    detail: {
      cell,
      cellId
    }
  })
  window.dispatchEvent(event)
}

function setSelection(prevCellId: number | null, cellId: number | null) {
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

async function initialize(storeState) {
  const roomName = await storage.get("roomName")
  const fullRoomName = `${storeState.gameData.filename}/${roomName}`

  setupSync(
    storeState,
    async (prevCellId: number | null, cellId: number | null) => {
      setSelection(prevCellId, cellId)
    },
    async (cellId, cell) => {
      setCell(cellId, cell)
    },
    fullRoomName
  )
}

window.addEventListener("nytogether-store", async (e: CustomEvent) => {
  // store state is sent by the main world page script
  const storeState = e.detail
  currStoreState = storeState

  if (await storage.get("joinAutomatically")) {
    initialize(storeState)
  }
  updateStoreState(storeState)
})
