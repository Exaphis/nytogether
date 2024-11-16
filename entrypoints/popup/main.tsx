import React from 'react'
import { createRoot } from 'react-dom/client'
import './tailwind.css'
import { Button } from '@/components/ui/button'

function Popup() {
    const [count, setCount] = React.useState(10)

    return (
        <div className="w-[300px] p-4 text-center">
            <h1 className="text-2xl font-bold mb-4">WXT React Popup</h1>
            <div className="p-8">
                <Button onClick={() => setCount(count + 1)} variant="outline">
                    Count is {count}
                </Button>
                <p className="mt-4">
                    Edit{' '}
                    <code className="bg-gray-100 px-1 rounded">
                        popup/main.tsx
                    </code>{' '}
                    and save to test HMR
                </p>
            </div>
        </div>
    )
}

// Mount React app
const root = createRoot(document.getElementById('app')!)
root.render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>
)
