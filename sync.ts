import assert from "assert"
import { isEqual } from "lodash"
import { joinRoom, type Room } from "trystero"
import aloneIcon from "url:~assets/alone-48.png"
import togetherIcon from "url:~assets/together-48.png"

import { sendToBackground } from "@plasmohq/messaging"

export interface Cell {
  guess: string
  penciled: boolean
}

// Canonical sync cells
let cells: Cell[]
// Current user's selection.
let selection: number | null = null
// Map of peer id to their selection.
let peerSelections: Map<string, number> = new Map()
// Whether or not we are currently syncing the store state.
// If so, we want to ignore all store updates.
let syncing = false

let globalSendSelection: any = null
let globalSendCell: any = null

export function nytCellToCell(nytCell: any): Cell {
  return {
    guess: nytCell.guess,
    penciled: nytCell.penciled
  }
}

export function updateStoreState(state: any) {
  if (syncing) {
    return
  }
  assert(globalSendCell !== null && globalSendSelection !== null)
  console.log("updating state")

  let newSelection = state.selection.cell
  if (newSelection !== selection) {
    selection = newSelection

    if (globalSendSelection !== null) {
      globalSendSelection(state.selection.cell).then(() => {
        console.log("sent selection")
      })
    }
  }

  for (let i = 0; i < cells.length; i++) {
    const newCell = nytCellToCell(state.cells[i])
    if (!isEqual(newCell, cells[i])) {
      cells[i] = newCell

      if (globalSendCell !== null) {
        globalSendCell({ cellId: i, value: newCell }).then(() => {
          console.log("sent cell @ %d, value: %s", i, newCell.guess)
        })
      }
    }
  }
}

let currRoomName: string | null = null
let currRoom: Room | null = null
let originalRoomName: string | null = null

interface SyncState {
  roomName: string
  numPeers: number
}

function getSyncState(): SyncState | null {
  if (currRoom === null) {
    return null
  }

  return {
    roomName: originalRoomName!,
    numPeers: Object.keys(currRoom.getPeers()).length
  }
}

function sendSyncState() {
  const syncState = getSyncState()
  if (syncState !== null) {
    sendToBackground({
      name: "setIcon",
      body: {
        path: syncState.numPeers === 0 ? aloneIcon : togetherIcon
      }
    })

    chrome.runtime.sendMessage({
      name: "nytogether-msg-setSyncState",
      syncState
    })
  }
}

chrome.runtime.onMessage.addListener((req, _sender, _sendResponse) => {
  if (req.name === "nytogether-msg-getSyncState") {
    sendSyncState()
  }
})

export function setupSync(
  state: any,
  onSelectionUpdate: (peerSelections: Map<string, number>) => Promise<void>,
  onSetCell: (cellId: number, value: Cell) => Promise<void>,
  roomName: string
) {
  // Make the function idempotent
  if (roomName === currRoomName) {
    return
  }

  cells = null
  selection = null
  peerSelections = new Map()
  syncing = false
  globalSendSelection = null
  globalSendCell = null

  if (currRoom) {
    currRoom.leave()
    // reset peer selections to null
    onSelectionUpdate(peerSelections)
  }

  currRoomName = roomName

  // Initialize the room
  cells = state.cells.map(nytCellToCell)
  selection = state.selection.cell

  console.log("setting up sync, room name: %s", roomName)

  const config = { appId: "nytogether" }
  currRoom = joinRoom(config, roomName)

  let joinedRoomName = currRoomName
  const expectedPrefix = `${state.gameData.filename}/`
  if (joinedRoomName.startsWith(expectedPrefix)) {
    joinedRoomName = joinedRoomName.slice(expectedPrefix.length)
  }
  originalRoomName = joinedRoomName

  const [sendInitialBoard, receiveInitialBoard] =
    currRoom.makeAction("initialize")

  receiveInitialBoard((data: Cell[]) => {
    console.log("received initial board")
    console.log(data)
    // ensure that all cells are compatible with the new board
    // (i.e., no conflicting cells) before initializing
    assert(cells.length === data.length)
    let compatible = true
    for (let i = 0; i < data.length; i++) {
      if (
        cells[i].guess !== "" &&
        data[i].guess !== "" &&
        !isEqual(cells[i], data[i])
      ) {
        compatible = false
        break
      }
    }

    if (!compatible) {
      const reset = confirm(
        "The room you are trying to join conflicts with your current board. Do you want to reset your board to the room's board?"
      )
      if (!reset) {
        return
      }
    }

    syncing = true
    for (let i = 0; i < data.length; i++) {
      if (data[i].guess !== "" && !isEqual(cells[i], data[i])) {
        onSetCell(i, data[i])
        cells[i] = data[i]
      }
    }
    syncing = false
  })

  const [sendSelection, receiveSelection] = currRoom.makeAction("selection")
  receiveSelection((data: number, peerId: string) => {
    // TODO: instead of single cell, send the clue selected and
    // highlight the entire row/columns
    if (peerSelections.get(peerId) === data) {
      return
    }
    peerSelections.set(peerId, data)
    onSelectionUpdate(peerSelections)
  })

  const [sendCell, receiveCell] = currRoom.makeAction("cell")
  receiveCell(async (data: any, _peerId) => {
    syncing = true
    cells[data.cellId] = data.value
    await onSetCell(data.cellId, data.value)
    syncing = false
  })

  currRoom.onPeerJoin((_peerId: string) => {
    // TODO: this actually fires if the user joins a room that
    // already exists. We should not send initial board state, or
    // ignore this board state if so.
    // We could use the cell last modified timestamp to resolve conflicts
    // instead?
    console.log("peer id w/ id %s joined, sending board data", _peerId)
    assert(cells !== null)
    sendInitialBoard(cells)
    sendSelection(selection)

    sendSyncState()
  })

  currRoom.onPeerLeave((peerId: string) => {
    console.log("peer id w/ id %s left", peerId)
    peerSelections.delete(peerId)
    onSelectionUpdate(peerSelections)

    sendSyncState()
  })

  globalSendSelection = sendSelection
  globalSendCell = sendCell
  sendSyncState()
}
