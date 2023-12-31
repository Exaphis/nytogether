import type { PlasmoCSConfig } from "plasmo"

import { listen } from "@plasmohq/messaging/message"
import { Storage } from "@plasmohq/storage"

import { getSyncState, setupSync, updateStoreState, type Cell } from "~sync"

export const config: PlasmoCSConfig = {
  matches: ["https://www.nytimes.com/crosswords/game/*"],
  all_frames: true
}

const storage = new Storage()
let currStoreState = null

listen(async (req, res) => {
  if (req.name === "nytogether-msg-alive") {
    res.send(true)
  } else if (req.name === "nytogether-msg-joinGame") {
    initialize(currStoreState)
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

function setSelections(cellIds: number[]) {
  const cellElems = document.querySelectorAll(".xwd__cell")
  for (let i = 0; i < cellElems.length; i++) {
    const cellElem = cellElems[i]
    const inputElem = cellElem.querySelector("rect")
    if (cellIds.includes(i)) {
      inputElem.style.fill = "greenyellow"
    } else {
      inputElem.style.removeProperty("fill")
    }
  }
}

async function initialize(storeState) {
  const roomName = await storage.get("roomName")
  const fullRoomName = `${storeState.gameData.filename}/${roomName}`

  setupSync(
    storeState,
    async (peerSelections: Map<string, number>) => {
      setSelections(Array.from(peerSelections.values()))
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
