import React from 'react'
import { createRoot } from 'react-dom/client'
import './tailwind.css'
import { onMessage, sendMessage } from 'webext-bridge/popup'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/popup] ${message}`, ...args)
}

interface Member {
    userId: string
}

interface RoomState {
    cells?: any[]
    nytogetherState?: {
        userId?: string
        members?: { [name: string]: Member }
    }
}

function sendMessageToTab(messageID: string, data: any) {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
        if (tabs.length > 0) {
            sendMessage(messageID, data, `content-script@${tabs[0].id}`)
        }
    })
}

function useRoomState() {
    const [roomState, setRoomState] = React.useState<RoomState | null>(null)

    React.useEffect(() => {
        const unlisten = onMessage('room-state', (message) => {
            log('Received room state message', message)

            // the room state update from the content script can be partial,
            // so we merge it with the current state
            setRoomState((prev) => ({
                ...prev,
                ...(message.data as RoomState),
            }))
        })

        sendMessageToTab('query-room-state', {})
        log('Listening for room state messages')
        return unlisten
    }, [setRoomState])

    const customSetRoomState = React.useCallback(
        (newState: RoomState) => {
            sendMessageToTab('set-room-state', newState)
        },
        [sendMessageToTab]
    )
    return { roomState, setNYTogetherState: customSetRoomState }
}

function Contents() {
    const { roomState, setNYTogetherState } = useRoomState()

    if (roomState === null) {
        return (
            <Alert>
                <AlertTitle>No puzzle found</AlertTitle>
                <AlertDescription>
                    Open a NYT crossword puzzle to get started!
                </AlertDescription>
            </Alert>
        )
    }
    return <p>Hello {roomState.nytogetherState?.userId}</p>
}

// Mount React app
const root = createRoot(document.getElementById('app')!)
root.render(
    <React.StrictMode>
        <div className="w-[300px] p-4 text-center">
            <h1 className="text-2xl font-bold mb-4">NYTogether</h1>
            <Contents />
        </div>
    </React.StrictMode>
)
