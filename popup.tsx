import { nanoid } from "nanoid"
import { useCallback, useEffect, useState } from "react"

import { sendToContentScript } from "@plasmohq/messaging"
import { useStorage } from "@plasmohq/storage/hook"

function IndexPopup() {
  const [roomName, setRoomName] = useStorage("roomName", (v) =>
    v === undefined || v === "" ? nanoid(10) : v
  )
  const [joinAutomatically, setJoinAutomatically] = useStorage(
    "joinAutomatically",
    (v) => (v === undefined ? false : v)
  )

  const [isAlive, setIsAlive] = useState(false)
  const [joinedRoomName] = useStorage("joinedRoomName")
  console.log(joinedRoomName)
  const [numPeers] = useStorage("numPeers", 0)
  const joinedRoom = joinedRoomName === roomName

  useEffect(() => {
    async function updateState() {
      const res = await sendToContentScript({ name: "nytogether-msg-alive" })
      setIsAlive(!!res)
    }
    updateState()
  }, [setIsAlive])

  let contents = <p>Content script not found.</p>
  if (isAlive) {
    contents = (
      <>
        <label>
          Room name:
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            style={{ fontFamily: "monospace" }}></input>
        </label>
        <label>
          Join automatically:
          <input
            checked={joinAutomatically}
            onChange={(e) => setJoinAutomatically(e.target.checked)}
            type="checkbox"
          />
        </label>
        <hr />
        <button
          onClick={async () => {
            await sendToContentScript({ name: "nytogether-msg-joinGame" })
          }}
          disabled={joinedRoom}>
          Join room
        </button>
        {joinedRoom && <p>Connected peers: {numPeers}</p>}
      </>
    )
  }

  return (
    <>
      <h1>NYTogether</h1>
      {contents}
    </>
  )
}

export default IndexPopup
