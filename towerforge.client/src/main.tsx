// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'
import { useGameStore } from './store/useGameStore'
import { tabFromPath } from './routes'

// Open the tab the address names (towerforge.net/creators → Creator Codes).
const tab = tabFromPath(window.location.pathname)
if (tab) useGameStore.getState().setActiveTab(tab)

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
)