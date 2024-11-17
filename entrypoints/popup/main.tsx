import React from 'react'
import { createRoot } from 'react-dom/client'
import './tailwind.css'
import { onMessage, sendMessage } from 'webext-bridge/popup'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormMessage } from '@/components/ui/form'
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
} from '@/components/ui/form'
import { useForm } from 'react-hook-form'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/popup] ${message}`, ...args)
}

interface Member {
    userId: string
}

interface NYTogetherState {
    roomName?: string
    username?: string
    userId?: string
    members?: { [name: string]: Member }
}

interface RoomState {
    cells?: any[]
    nytogetherState?: NYTogetherState
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
        (newState: NYTogetherState) => {
            sendMessageToTab('set-nytogether-state', newState)
        },
        [sendMessageToTab]
    )
    return { roomState, setNYTogetherState: customSetRoomState }
}

const roomFormSchema = z.object({
    displayName: z.string().min(1, { message: 'Display name is required' }),
    roomName: z.string().min(1, { message: 'Room name is required' }),
    autoJoin: z.boolean(), // TODO: implement
})

function Contents() {
    const { roomState, setNYTogetherState } = useRoomState()

    const form = useForm<z.infer<typeof roomFormSchema>>({
        resolver: zodResolver(roomFormSchema),
        defaultValues: {
            displayName: '',
            roomName: '',
            autoJoin: false,
        },
    })

    function onSubmit(data: z.infer<typeof roomFormSchema>) {
        log('Joining room', data)
        setNYTogetherState({
            roomName: data.roomName,
            username: data.displayName,
        })
        sendMessageToTab('join-room', {})
    }

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

    if (roomState.nytogetherState?.roomName) {
        const members = roomState.nytogetherState.members || {}
        const currentUserId = roomState.nytogetherState.userId

        return (
            <div className="flex flex-col gap-4 items-start">
                <div className="flex flex-col gap-2 items-start">
                    <h2 className="font-medium text-lg">
                        Room: {roomState.nytogetherState.roomName}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        You are: {roomState.nytogetherState.username}
                    </p>
                </div>
                <div className="flex flex-col gap-2">
                    <h3 className="font-medium text-left text-lg">
                        Connected Users:
                    </h3>
                    <div className="flex flex-col gap-1">
                        {Object.entries(members).map(([username, member]) => (
                            <div
                                key={member.userId}
                                className="flex items-center gap-2 text-sm text-left"
                            >
                                <span>{username}</span>
                                {member.userId === currentUserId && (
                                    <span className="text-xs text-muted-foreground">
                                        (you)
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-2"
            >
                <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                        <FormItem>
                            <FormControl>
                                <Input {...field} placeholder="Display name" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="roomName"
                    render={({ field }) => (
                        <FormItem>
                            <FormControl>
                                <Input {...field} placeholder="Room name" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="autoJoin"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                                Auto join
                            </FormLabel>
                        </FormItem>
                    )}
                />
                <Button type="submit">Join room</Button>
            </form>
        </Form>
    )
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
