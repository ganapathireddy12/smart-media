import { useAppStore } from './store/appStore'
import { useBackgroundScanning } from './hooks/useBackgroundScanning'
import { motion, AnimatePresence } from 'framer-motion'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ProcessingStatusBadge from './components/ProcessingStatusBadge'
import SplashScreen from './pages/SplashScreen'
import NameScreen from './pages/NameScreen'
import ModelDownloadScreen from './pages/ModelDownloadScreen'
import FolderSelectionScreen from './pages/FolderSelectionScreen'
import ScanningScreen from './pages/ScanningScreen'
import HomePage from './pages/HomePage'
import SettingsScreen from './pages/SettingsScreen'
import FacesPage from './pages/FacesPage'
import EmotionsPage from './pages/EmotionsPage'
import FavoritesPage from './pages/FavoritesPage'
import AlbumsPage from './pages/AlbumsPage'
import TrashPage from './pages/TrashPage'
import LockerPage from './pages/LockerPage'
import ToolsPage from './pages/ToolsPage'

import TimelinePage from './pages/TimelinePage'
import DuplicatesPage from './pages/DuplicatesPage'
import MapPage from './pages/MapPage'
import StoriesPage from './pages/StoriesPage'
import FileTypesPage from './pages/FileTypesPage'
import CollagePage from './pages/CollagePage'
import SearchPage from './pages/SearchPage'
import { ErrorBoundary } from './components/ErrorBoundary'

function App() {
  const currentScreen = useAppStore((state) => state.currentScreen)

  // Run background scanning globally - continues even when navigating away
  useBackgroundScanning()

  // Screens that should show the sidebar
  const pagesWithSidebar = ['home', 'settings', 'faces', 'emotions', 'favorites', 'albums', 'trash', 'locker', 'tools', 'memories', 'timeline', 'duplicates', 'map', 'stories', 'fileTypes', 'collage', 'search']
  const showSidebar = pagesWithSidebar.includes(currentScreen)

  return (
    <ErrorBoundary>
      <div className="h-screen w-screen bg-[#0c0c0c] text-white flex flex-col overflow-hidden">
        <TitleBar />
        <main className="flex-1 overflow-hidden relative flex">
          {/* Fixed Sidebar - Only shown for main app pages */}
          {showSidebar && <Sidebar currentPage={currentScreen} />}

          {/* Page Content Area */}
          <div className="flex-1 overflow-hidden relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentScreen}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0"
              >
                {currentScreen === 'splash' && <SplashScreen />}
                {currentScreen === 'name' && <NameScreen />}
                {currentScreen === 'modelDownload' && <ModelDownloadScreen />}
                {currentScreen === 'folderSelection' && <FolderSelectionScreen />}
                {currentScreen === 'scanning' && <ScanningScreen />}
                {currentScreen === 'home' && <HomePage />}
                {currentScreen === 'settings' && <SettingsScreen />}
                {currentScreen === 'faces' && <FacesPage />}
                {currentScreen === 'emotions' && <EmotionsPage />}
                {currentScreen === 'favorites' && <FavoritesPage />}
                {currentScreen === 'albums' && <AlbumsPage />}
                {currentScreen === 'trash' && <TrashPage />}
                {currentScreen === 'locker' && <LockerPage />}
                {currentScreen === 'tools' && <ToolsPage />}

                {currentScreen === 'timeline' && <TimelinePage />}
                {currentScreen === 'duplicates' && <DuplicatesPage />}
                {currentScreen === 'map' && <MapPage />}
                {currentScreen === 'stories' && <StoriesPage />}
                {currentScreen === 'fileTypes' && <FileTypesPage />}
                {currentScreen === 'collage' && <CollagePage />}
                {currentScreen === 'search' && <SearchPage />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Processing Status Badge - Shows when images are being analyzed */}
        <ProcessingStatusBadge />

      </div>
    </ErrorBoundary>
  )
}

export default App
