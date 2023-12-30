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

  const [joinedRoom, setJoinedRoom] = useState(false)
  const [numPeers, setNumPeers] = useState(0)

  const updateState = useCallback(async () => {
    const res = await sendToContentScript({ name: "nytogether-msg-getRoom" })
    console.log(res)
    if (res === null) {
      setJoinedRoom(false)
      return
    }

    const { roomName: currentRoomName, peers } = res
    console.log(currentRoomName)
    console.log(roomName)
    setJoinedRoom(currentRoomName === roomName)
    setNumPeers(peers)
  }, [setJoinedRoom, setNumPeers, roomName])

  useEffect(() => {
    updateState()
  }, [updateState])

  return (
    <>
      <h1>NYTogether</h1>
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
          await updateState()
        }}
        disabled={joinedRoom}>
        Join room
      </button>
      {joinedRoom && <p>Connected peers: {numPeers}</p>}
    </>
  )
}

export default IndexPopup
