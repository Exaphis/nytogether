import { useEffect, useState } from "react"

import { getGameState, type GameState } from "~constants"

function useGameState(): GameState | null {
  const [gameState, setGameState] = useState(null)

  // poll every 1 second for the latest game state
  useEffect(() => {
    getGameState(setGameState)
    const intervalId = setInterval(() => {
      getGameState(setGameState)
    }, 1000)

    return () => {
      clearInterval(intervalId)
    }
  })

  return gameState
}

function IndexPopup() {
  const gameState = useGameState()

  return (
    <div
      style={{
        padding: 16
      }}>
      <h2>
        Welcome to your{" "}
        <a href="https://www.plasmo.com" target="_blank">
          Plasmo
        </a>{" "}
        Extension!
      </h2>
      <a href="https://docs.plasmo.com" target="_blank">
        View Docs
      </a>
      <pre>{JSON.stringify(gameState, null, 2)}</pre>
    </div>
  )
}

export default IndexPopup
