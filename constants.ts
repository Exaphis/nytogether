// Content script callbacks
// Popup/background/etc. can reach out to the content script to get the game state
const GET_GAME_STATE = "GET_GAME_STATE"

export function registerListeners(getGameState: () => GameState) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === GET_GAME_STATE) {
      sendResponse(getGameState())
    }
  })
}
export function getGameState(callback: (gameState: GameState | null) => void) {
  chrome.tabs.query(
    {
      active: true,
      lastFocusedWindow: true
    },
    (tabs) => {
      const [tab] = tabs
      chrome.tabs.sendMessage(
        tab.id,
        {
          type: GET_GAME_STATE
        },
        (gameState: GameState) => {
          if (gameState === undefined || gameState === null) {
            callback(null)
          } else {
            callback(gameState)
          }
        }
      )
    }
  )
}

export interface GameState {
  data: string
}
