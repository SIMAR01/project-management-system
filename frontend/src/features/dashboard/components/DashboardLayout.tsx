import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { SessionModal } from '../../auth/components/SessionModal';
import { useFetchSessionsQuery } from '../../auth/hooks/useAuthMutations';
import { useQuery } from '@tanstack/react-query';
import { axiosClient } from '../../../api/axiosClient';
import {
  User,
  Shield,
  FolderKanban,
  Activity,
  LogOut,
  Settings,
  HelpCircle,
  Plus,
  Loader2,
  Calendar,
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
    { label: 'System Activity', href: '#activity', icon: Activity },
    { label: 'Preferences', href: '#settings', icon: Settings },
    { label: 'Documentation', href: '#help', icon: HelpCircle },
  ];

  // Fetch workspaces using React Query to demonstrate live backend integration
  const { data: projects = [], isLoading: loadingProjects } = useQuery<any[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await axiosClient.get('/projects');
      return response.data.data;
    },
    retry: 1,
    refetchOnWindowFocus: false,
  });

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

        {/* Right Content Pane: Project Workspace list */}
        <main className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Project Workspaces</h2>
            </div>

            <button className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white font-medium py-2 px-3.5 rounded-lg text-sm transition-colors shadow-md shadow-brand-600/15">
              <Plus className="w-4 h-4" />
              <span>New Workspace</span>
            </button>
          </div>

          {loadingProjects ? (
            /* Skeleton Workspaces */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="glass-card rounded-2xl p-5 space-y-3 animate-pulse">
                  <div className="h-4 w-1/2 bg-slate-800 rounded"></div>
                  <div className="h-3 w-3/4 bg-slate-800 rounded"></div>
                  <div className="h-8 w-24 bg-slate-800 rounded mt-4"></div>
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            /* Empty State */
            <div className="glass-card rounded-2xl p-8 text-center border-dashed border-slate-800">
              <div className="w-12 h-12 rounded-xl bg-slate-900/80 flex items-center justify-center text-slate-500 mx-auto mb-4 border border-slate-800">
                <FolderKanban className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-200">No active workspaces</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1.5 leading-relaxed">
                Create a new workspace using the button above to begin collaborating and tracking timeline audit logs.
              </p>
            </div>
          ) : (
            /* Active Workspaces */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {projects.map((project) => (
                <div
                  key={project.projectId}
                  className="glass-card rounded-2xl p-5 hover:border-slate-700/80 transition-all duration-300 flex flex-col justify-between group cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="font-semibold text-slate-100 group-hover:text-brand-300 transition-colors">
                        {project.name}
                      </span>
                      {project.isArchived && (
                        <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                          Archived
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {project.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-5 border-t border-slate-900 pt-3">
                    <Calendar className="w-3 h-3" />
                    <span>Created: {new Date(project.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
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
