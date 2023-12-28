import assert from "assert"
import { isEqual } from "lodash"
import { joinRoom } from "trystero"

export interface Cell {
  guess: string
  penciled: boolean
}

// Canonical sync cells
let cells: Cell[]
// Current user's selection.
let selection: number | null = null
// Map of peer id to their selection.
// TODO: handle multiple peers on the same cell
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

  let newSelection = state.selection.cell
  if (newSelection !== selection) {
    selection = newSelection

    globalSendSelection(state.selection.cell).then(() => {
      console.log("sent selection")
    })
  }

  for (let i = 0; i < cells.length; i++) {
    const newCell = nytCellToCell(state.cells[i])
    if (!isEqual(newCell, cells[i])) {
      cells[i] = newCell

      globalSendCell({ cellId: i, value: newCell }).then(() => {
        console.log("sent cell")
      })
    }
  }
}

let currRoomName = null
let currRoom = null

export function setupSync(
  state: any,
  onSetSelection: (
    prevCellId: number | null,
    cellId: number | null
  ) => Promise<void>,
  onSetCell: (cellId: number, value: Cell) => Promise<void>,
  roomName: string
) {
  // Make the function idempotent
  if (roomName === currRoomName) {
    return
  }
  currRoom?.leave()
  currRoomName = roomName

  // Initialize the room
  cells = state.cells.map(nytCellToCell)
  selection = state.selection.cell

  console.log("setting up sync, room name: %s", roomName)

  const config = { appId: "nytogether" }
  currRoom = joinRoom(config, roomName)

  const [sendInitialBoard, receiveInitialBoard] =
    currRoom.makeAction("initialize")
  receiveInitialBoard((data: Cell[]) => {
    console.log("received initial board")
    console.log(data)
    // ensure that all cells are empty before initializing
    let allEmpty = true
    for (const cell of cells!) {
      if (cell.guess !== "") {
        allEmpty = false
        break
      }
    }

    if (allEmpty) {
      syncing = true
      for (let i = 0; i < data!.length; i++) {
        if (!isEqual(cells[i], data[i])) {
          onSetCell(i, data[i])
          cells[i] = data[i]
        }
      }
      syncing = false
    } else {
      console.error("not initializing, cells are not empty")
    }
  })

  const [sendSelection, receiveSelection] = currRoom.makeAction("selection")
  receiveSelection((data: number, peerId: string) => {
    if (peerSelections.get(peerId) === data) {
      return
    }
    const prevPeerSelection = peerSelections.get(peerId) ?? null
    console.log(peerSelections)
    onSetSelection(prevPeerSelection, data)
    peerSelections.set(peerId, data)
  })

  const [sendCell, receiveCell] = currRoom.makeAction("cell")
  receiveCell((data: any, _peerId) => {
    syncing = true
    onSetCell(data.cellId, data.value)
    cells[data.cellId] = data.value
    syncing = false
  })

  currRoom.onPeerJoin((_peerId: string) => {
    console.log("peer id w/ id %s joined, sending board data", _peerId)
    assert(cells !== null)
    sendInitialBoard(cells)
    sendSelection(selection)
  })

  currRoom.onPeerLeave((peerId: string) => {
    console.log("peer id w/ id %s left", peerId)
    onSetSelection(peerSelections.get(peerId) ?? null, null)
    peerSelections.delete(peerId)
  })

  globalSendSelection = sendSelection
  globalSendCell = sendCell
}
