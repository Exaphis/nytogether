import assert from "assert"
import { isEqual } from "lodash"
import { joinRoom } from "trystero"

// Interface:
// The sync module is responsible for syncing the state of the game.
// 1. When user joins - send them the current state of the game
// 2. When user sets selection - broadcast to all other users
// 3. When user sets cell - broadcast to all other users

// initial state will be received from the first user that responds.

interface ISyncParams {
  state: any
  onInitialize: (cells: Cell[]) => void
  onSetSelection: (
    peerId: string,
    prevCellId: number | null,
    cellId: number | null
  ) => void
  onSetCell: (cellId: number, value: Cell) => void
  roomName: string
}

export interface Cell {
  guess: string
  penciled: boolean
}

let cells: Cell[] | null = null
let selection: number | null = null
let peerSelections: Map<string, number> = new Map()
let globalSendSelection: any = null
let globalSendCell: any = null

export function nytCellToCell(nytCell: any): Cell {
  return {
    guess: nytCell.guess,
    penciled: nytCell.penciled
  }
}

// TODO: debounce selection updates?
export function updateStoreState(state: any) {
  assert(cells !== null)

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

export function setupSync(params: ISyncParams) {
  cells = params.state.cells.map(nytCellToCell)
  selection = params.state.selection.cell
  console.log("setting up sync")
  console.log(cells)
  console.log(selection)

  const config = { appId: "nytogether" }
  const room = joinRoom(config, params.roomName)

  const [sendInitialBoard, receiveInitialBoard] = room.makeAction("initialize")
  receiveInitialBoard((data: Cell[]) => {
    console.log("received initial board")
    console.log(data)
    // ensure that all cells are empty before initializing
    let allEmpty = true
    for (const cell of cells!) {
      if (cell.guess !== "") {
        allEmpty = false
        break;
      }
    }

    if (allEmpty) {
      params.onInitialize(data)
    }
    else {
      console.error("not initializing, cells are not empty")
    }
  })

  const [sendSelection, receiveSelection] = room.makeAction("selection")
  receiveSelection((data: number, peerId: string) => {
    if (peerSelections.get(peerId) === data) {
      return
    }
    const prevPeerSelection = peerSelections.get(peerId) ?? null
    console.log(peerSelections)
    params.onSetSelection(peerId, prevPeerSelection, data)
    peerSelections.set(peerId, data)
  })

  const [sendCell, receiveCell] = room.makeAction("cell")
  receiveCell((data: any, _peerId) => {
    params.onSetCell(data.cellId, data.value)
  })

  room.onPeerJoin((_peerId: string) => {
    console.log("peer id w/ id %s joined, sending board data", _peerId)
    assert(cells !== null)
    sendInitialBoard(cells)
    sendSelection(selection)
  })

  room.onPeerLeave((peerId: string) => {
    console.log("peer id w/ id %s left", peerId)
    params.onSetSelection(peerId, peerSelections.get(peerId) ?? null, null)
    peerSelections.delete(peerId)
  })

  globalSendSelection = sendSelection
  globalSendCell = sendCell
}
