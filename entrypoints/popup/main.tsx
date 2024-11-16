import React from 'react'
import { createRoot } from 'react-dom/client'
import './tailwind.css'

function Popup() {
    const [count, setCount] = React.useState(10)

    return (
        <div className="w-[300px] p-4 text-center">
            <h1 className="text-2xl font-bold mb-4">WXT React Popup</h1>
            <div className="p-8">
                <button
                    onClick={() => setCount(count + 1)}
                    className="rounded-lg bg-gray-900 text-white px-4 py-2 text-base font-medium 
                             hover:border-purple-500 hover:border transition-colors duration-200"
                >
                    Count is {count}
                </button>
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
