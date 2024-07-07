import { registerListeners, type GameState } from "~constants"

let gameState: GameState = {
  data: ""
}

registerListeners(() => gameState)
