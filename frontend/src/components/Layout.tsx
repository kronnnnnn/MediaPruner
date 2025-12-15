import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import { useSidebar } from '../contexts/SidebarContext'

export default function Layout() {
  const { isCollapsed } = useSidebar()
  
  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 transition-colors">
      <Sidebar />
      <div className={`flex flex-col flex-1 overflow-hidden transition-all duration-300 ${isCollapsed ? 'ml-0' : 'ml-0'}`}>
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6 bg-gray-100 dark:bg-gray-900 transition-colors">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
