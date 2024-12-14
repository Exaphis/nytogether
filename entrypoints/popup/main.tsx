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
import { AutoJoinState, NYTStoreState, RoomState } from '@/lib/nyt-interfaces'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { Info, AlertCircle } from 'lucide-react'
import { GetDataType, GetReturnType, ProtocolMap } from 'webext-bridge'
import { browser } from 'wxt/browser'

const log = (message: string, ...args: any[]) => {
    console.log(`[NYTogether/popup] ${message}`, ...args)
}

async function getTabId() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    if (tabs.length > 0) {
        return tabs[0].id || null
    }
    return null
}

async function sendMessageToTab<K extends keyof ProtocolMap>(
    messageID: K,
    data: GetDataType<K, any>
): Promise<GetReturnType<K, any> | null> {
    const tabId = await getTabId()
    if (tabId) {
        return await sendMessage(messageID, data, `content-script@${tabId}`)
    }
    return null
}

function useRoomGameState() {
    const [tabId, setTabId] = React.useState<number | null>(null)
    const [gameState, setGameState] = React.useState<NYTStoreState | null>(null)
    const [roomState, setRoomState] = React.useState<RoomState | null>(null)

    React.useEffect(() => {
        getTabId().then(setTabId)
    }, [])

    React.useEffect(() => {
        if (tabId === null) {
            return
        }

        const port = browser.runtime.connect({
            name: `nytogether-popup@${tabId}`,
        })
        port.onMessage.addListener((message: any) => {
            if (message.type === 'game-state') {
                setGameState(message.data)
            }
            if (message.type === 'room-state') {
                setRoomState(message.data)
            }
        })

        return () => {
            port.disconnect()
        }
    }, [tabId])

    return [gameState, roomState] as const
}

function useAutoJoinState() {
    const [autoJoin, setAutoJoin] = React.useState<AutoJoinState | null>(null)
    const [autoJoinItem, setAutoJoinItem] = React.useState<any>(null)

    React.useEffect(() => {
        const item = storage.defineItem<AutoJoinState | null>(
            'local:autojoin',
            {
                fallback: null,
            }
        )
        setAutoJoinItem(item)
        item.getValue().then(setAutoJoin)
        return item.watch((value) => {
            setAutoJoin(value)
        })
    }, [setAutoJoinItem])

    const setAutoJoinValue = React.useCallback(
        async (value: AutoJoinState | null) => {
            await autoJoinItem.setValue(value)
        },
        [autoJoinItem]
    )

    return [autoJoin, setAutoJoinValue] as const
}

const roomFormSchema = z.object({
    displayName: z.string().min(1, { message: 'Display name is required' }),
    roomName: z.string().min(1, { message: 'Room name is required' }),
    autoJoin: z.boolean(), // TODO: implement
})

function Contents() {
    const [gameState, roomState] = useRoomGameState()
    const [, setAutoJoin] = useAutoJoinState()

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
        try {
            const result = await sendMessageToTab('join-room', {
                roomName: data.roomName,
                username: data.displayName,
            })
            log('join-room result:', result)

            if (result === null || !result.success) {
                form.setError('root.backendError', {
                    type: 'custom',
                    message: result?.error || 'Failed to join room',
                })
                log('set error')
                return
            }

            setAutoJoin(
                data.autoJoin
                    ? {
                          roomName: data.roomName,
                          displayName: data.displayName,
                      }
                    : null
            )
        } catch (err) {
            form.setError('root.backendError', {
                message: 'An unexpected error occurred',
            })
            console.error('Error joining room:', err)
        }
    }

    function leaveRoom() {
        setAutoJoin(null)
        sendMessageToTab('leave-room', null)
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

        const sizeMismatchMessage =
            gameState.cells.length !== Object.keys(roomState.guesses).length
                ? `Board size mismatch: ${gameState.cells.length} vs ${
                      Object.keys(roomState.guesses).length
                  }`
                : null

        const mismatches: Array<{
            cell: number
            gameGuess: string
            roomGuess: string
        }> = []
        for (let i = 0; i < gameState.cells.length; i++) {
            const gameCell = gameState.cells[i]
            const roomCell = roomState.guesses[i]
            const gameGuess = gameCell?.guess || ''
            const roomGuess = roomCell?.letter || ''

            if (gameGuess !== roomGuess) {
                mismatches.push({
                    cell: i + 1,
                    gameGuess,
                    roomGuess,
                })
            }
        }

        return (
            <div className="flex flex-col gap-4 items-start">
                <div className="flex flex-col gap-2 items-start">
                    <h2 className="font-medium text-lg">
                        Room: {roomState.requestedRoomName}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Puzzle: {roomState.gameId}
                    </p>
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
                                className="flex items-center gap-2 text-sm text-left"
                                key={username}
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
                {sizeMismatchMessage ||
                    (mismatches.length > 0 && (
                        <Alert variant="destructive">
                            <AlertTitle>Game sync issue</AlertTitle>
                            <AlertDescription>
                                <div className="flex flex-col gap-1 text-sm">
                                    {sizeMismatchMessage && (
                                        <div className="text-left">
                                            {sizeMismatchMessage}
                                        </div>
                                    )}
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr>
                                                <th className="text-left">
                                                    Cell
                                                </th>
                                                <th className="text-left">
                                                    Your Guess
                                                </th>
                                                <th className="text-left">
                                                    Room Guess
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {mismatches.map((mismatch, idx) => (
                                                <tr key={idx}>
                                                    <td>{mismatch.cell}</td>
                                                    <td>
                                                        '{mismatch.gameGuess}'
                                                    </td>
                                                    <td>
                                                        '{mismatch.roomGuess}'
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </AlertDescription>
                        </Alert>
                    ))}
                <Button onClick={leaveRoom}>Leave room</Button>
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
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="w-4 h-4" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[200px]">
                                        <p>
                                            Whenever a crossword puzzle is
                                            opened, join the room automatically.
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </FormItem>
                    )}
                />

                {form.formState.errors.root?.backendError && (
                    <Alert variant="destructive">
                        <AlertTitle>Error joining room</AlertTitle>
                        <AlertDescription>
                            {form.formState.errors.root?.backendError.message}
                        </AlertDescription>
                    </Alert>
                )}
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
            <Contents />
        </div>
    </React.StrictMode>
)
