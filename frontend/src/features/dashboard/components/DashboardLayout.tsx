import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { SessionModal } from '../../auth/components/SessionModal';
import { useFetchSessionsQuery } from '../../auth/hooks/useAuthMutations';
import { Outlet } from 'react-router-dom';
import {
  FolderKanban,
  LogOut,
  Layers
} from 'lucide-react';

export const DashboardLayout: React.FC = () => {
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch active sessions to display the last active time of the current session
  const { data: sessions = [] } = useFetchSessionsQuery();
  const currentSession = sessions.find((s) => s.isCurrent);

  const formatTimestamp = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }) + ' at ' + date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (err) {
      return dateStr;
    }
  };

  const navItems = [
    { label: 'Workspaces', href: '#workspaces', icon: FolderKanban, isActive: true },
  ];

  // Projects query removed as it is now managed inside WorkspaceDashboard component

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Top Navigation Header */}
      <header className="glass-card border-x-0 border-t-0 sticky top-0 z-40 bg-slate-900/40 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-violet-500 flex items-center justify-center shadow-md shadow-brand-500/20">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
              TaskPilot
            </span>
          </div>
        </div>

        {/* User profile controls & Logout */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-sm font-semibold text-slate-200">{user?.name}</span>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-lg text-sm font-semibold border border-slate-750 transition-colors shadow-sm"
          >
            <LogOut className="w-4 h-4 text-brand-400" />
            <span>Logout & Sessions</span>
          </button>
        </div>
      </header>

      {/* Main Container Layout */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row gap-8">

        {/* Left Sidebar: Profile Details Panel */}
        <aside className="w-full md:w-64 shrink-0 flex flex-col gap-6">
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-750 flex items-center justify-center text-brand-400 text-xl font-bold font-sans">
                {user?.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-slate-100">{user?.name}</h3>
                <p className="text-xs text-slate-400 truncate w-36">{user?.email}</p>
              </div>
            </div>

            <hr className="border-slate-800/80" />

            <div className="space-y-2">
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Account Credentials</p>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Username</span>
                <span className="text-brand-300 font-semibold flex items-center gap-1">
                  {user?.username}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Menu Nav */}
          <nav className="glass-card rounded-2xl p-3 flex flex-col gap-1 text-sm font-medium">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${item.isActive
                    ? 'bg-brand-500/10 text-brand-300'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                    }`}
                >
                  <Icon className="w-4.5 h-4.5" />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>
        </aside>

        {/* Right Content Pane: Dynamically rendered via Router Outlet */}
        <main className="flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      {/* Session Management Modal */}
      <SessionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
