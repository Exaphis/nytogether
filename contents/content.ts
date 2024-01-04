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

// Augment the store state with a version number.
// This version number will be incremented any time a cell is set
// automatically.
//
// If we don't do this, the store subscriber can fire with old state
// after setCell returns, which causes the old state to be sent back
// to the other peers followed by the new state.
// This causes an infinite loop.
//
// A version number fixes the issue by ignoring old states encountered
// by the subscriber.
let expectedStoreDiffVersion = 0
let diffInitialized = false

listen(async (req, res) => {
  if (req.name === "nytogether-msg-alive") {
    res.send(true)
  } else if (req.name === "nytogether-msg-joinGame") {
    initialize(currStoreState)
  }
})

async function setCell(cellId: number, cell: Cell) {
  expectedStoreDiffVersion += 1
  await customEventTrigger(window, "nytogether-store-fillCell", {
    cell,
    cellId,
    nytogetherDiffVersion: expectedStoreDiffVersion
  })
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

  // Ignore if the NYT puzzle has not synced yet
  if (!storeState.transient.isSynced) {
    return
  }

  if (!diffInitialized) {
    diffInitialized = true
    await customEventTrigger(
      window,
      "nytogether-store-resetDiffVersion",
      expectedStoreDiffVersion
    )
    return
  }

  if (await storage.get("joinAutomatically")) {
    await initialize(storeState)
  }

  // This check must be placed after all async calls. Otherwise, the expected diff version
  // may be modified during the calls, causing us to update with a stale state.
  const currStoreDiffVersion =
    storeState.user.settings.nytogetherDiffVersion || 0
  if (currStoreDiffVersion < expectedStoreDiffVersion) {
    // ignore old states
    return
  }

  console.log(
    "continuing, store version %d, expected %d",
    currStoreDiffVersion,
    expectedStoreDiffVersion
  )
  console.log(storeState)
  updateStoreState(storeState)
})
