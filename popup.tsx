import { nanoid } from "nanoid"
import { useCallback, useEffect, useState } from "react"

import { sendToContentScript } from "@plasmohq/messaging"
import { useStorage } from "@plasmohq/storage/hook"

function useGameState() {
  const [currTab, setCurrTab] = useState(null)
  const [numPeers, setNumPeers] = useState(0)
  const [joinedRoomName, setJoinedRoomName] = useState("")
  const [isAlive, setIsAlive] = useState(false)

  const onMessage = useCallback(
    (msg, sender) => {
      console.log("received sync state message")
      console.log(currTab)
      console.log(sender)
      console.log(msg)
      if (
        msg.name === "nytogether-msg-setSyncState" &&
        sender.tab.id === currTab
      ) {
        setIsAlive(true)
        setNumPeers(msg.syncState.numPeers)
        setJoinedRoomName(msg.syncState.roomName)
      }
    },
    [currTab, setIsAlive, setNumPeers, setJoinedRoomName]
  )

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        return
      }
      const tabId = tabs[0].id
      setCurrTab(tabId)
      chrome.tabs.sendMessage(tabId!, {
        name: "nytogether-msg-getSyncState"
      })
    })

    chrome.runtime.onMessage.addListener(onMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
    }
  }, [onMessage, setCurrTab])

  return { isAlive, numPeers, joinedRoomName }
}

function IndexPopup() {
  // TODO: store state in background using a redux store
  // https://stackoverflow.com/a/34595184/6686559
  const [roomName, setRoomName] = useStorage("roomName", (v) =>
    v === undefined || v === "" ? nanoid(10) : v
  )
  const [joinAutomatically, setJoinAutomatically] = useStorage(
    "joinAutomatically",
    (v) => (v === undefined ? false : v)
  )

  const { isAlive, numPeers, joinedRoomName } = useGameState()
  const joinedRoom = joinedRoomName === roomName

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
