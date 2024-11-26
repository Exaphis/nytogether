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
import { NYTStoreState } from '@/lib/nyt-interfaces'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/popup] ${message}`, ...args)
}

interface Member {
    userId: string
}

interface RoomState {
    roomName: string
    username: string
    userId: string
    members: { [name: string]: Member }
}

async function sendMessageToTab(messageID: string, data: any) {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    if (tabs.length > 0) {
        return await sendMessage(
            messageID,
            data,
            `content-script@${tabs[0].id}`
        )
    }
}

function useRoomState() {
    const [roomState, setRoomState] = React.useState<RoomState | null>(null)

    React.useEffect(() => {
        const unlisten = onMessage('room-state', (message) => {
            log('Received room state update:', message)
            if (message.data === null) {
                setRoomState(null)
            } else {
                setRoomState(message.data as unknown as RoomState)
            }
        })

        async function fetchInitialState() {
            try {
                const state = await sendMessageToTab('query-room-state', {})
                if (state) {
                    setRoomState(state as unknown as RoomState)
                }
            } catch (err) {
                console.error('Error fetching initial room state:', err)
            }
        }

        fetchInitialState()
        return unlisten
    }, [setRoomState])

    return roomState
}

function useGameState() {
    const [gameState, setGameState] = React.useState<NYTStoreState | null>(null)

    React.useEffect(() => {
        const unlisten = onMessage('game-state', (message) => {
            log('Received game state update:', message)
            setGameState(message.data as NYTStoreState)
        })

        async function fetchInitialState() {
            try {
                const state = await sendMessageToTab('query-game-state', {})
                if (state) {
                    setGameState(state as NYTStoreState)
                }
            } catch (err) {
                console.error('Error fetching initial game state:', err)
            }
        }

        fetchInitialState()
        return unlisten
    }, [setGameState])

    return gameState
}

const roomFormSchema = z.object({
    displayName: z.string().min(1, { message: 'Display name is required' }),
    roomName: z.string().min(1, { message: 'Room name is required' }),
    autoJoin: z.boolean(), // TODO: implement
})

function Contents() {
    const roomState = useRoomState()
    const gameState = useGameState()

    const form = useForm<z.infer<typeof roomFormSchema>>({
        resolver: zodResolver(roomFormSchema),
        defaultValues: {
            displayName: '',
            roomName: '',
            autoJoin: false,
        },
    })

    async function onSubmit(data: z.infer<typeof roomFormSchema>) {
        log('Joining room', data)
        await sendMessageToTab('join-room', {
            roomName: data.roomName,
            username: data.displayName,
        })
    }

    if (gameState === null) {
        return (
            <Alert>
                <AlertTitle>No puzzle found</AlertTitle>
                <AlertDescription>
                    Open a NYT crossword puzzle to get started!
                </AlertDescription>
            </Alert>
        )
    }

    if (roomState !== null) {
        const members = roomState.members
        const currentUserId = roomState.userId

        return (
            <div className="flex flex-col gap-4 items-start">
                <div className="flex flex-col gap-2 items-start">
                    <h2 className="font-medium text-lg">
                        Room: {roomState.roomName}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        You are: {roomState.username}
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
                <Button onClick={() => sendMessageToTab('leave-room', {})}>
                    Leave room
                </Button>
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
