import type { PlasmoCSConfig } from "plasmo"

import { listen } from "@plasmohq/messaging/message"
import { Storage } from "@plasmohq/storage"

import { setupSync, updateStoreState, type Cell } from "~sync"
import { customEventTrigger } from "~utils"

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

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

async function setCell(cellId: number, cell: Cell) {
  await customEventTrigger(window, "nytogether-store-fillCell", {
    cell,
    cellId
  })
  // TODO: very hacky! wait for 250ms to ensure the store update
  // propagated.
  //
  // if we don't do this, the store subscriber can fire after
  // setCell returns, which causes the old state to be sent back
  // to the other peers, then causing an infinite loop
  //
  // waiting for 250ms will keep the "syncing" flag set to true,
  // which prevents the old state from being sent

  // idea: could we add a new reducer that updates some new field
  // of the store and check for that instead?
  await delay(250)
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Control") {
    setCell(0, {
      guess: "A",
      penciled: false
    })
  }
})

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
    setCell,
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
  console.log(storeState.cells[0])
  updateStoreState(storeState)
})
