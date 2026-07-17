import React, { useEffect, useState } from 'react';
import {
  useFetchSessionsQuery,
  useLogoutSessionMutation,
  useLogoutAllSessionsMutation,
} from '../hooks/useAuthMutations';
import { Session } from '../types/auth.types';
import {
  X,
  Monitor,
  Smartphone,
  Laptop,
  Globe,
  Loader2,
  Trash2,
  AlertTriangle,
  LogOut,
  Calendar,
  Network
} from 'lucide-react';

interface SessionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SessionModal: React.FC<SessionModalProps> = ({ isOpen, onClose }) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null);

  const { data: sessions = [], isLoading, error: queryError } = useFetchSessionsQuery();

  const logoutSessionMutation = useLogoutSessionMutation(
    () => {
      // Eviction success callback
      setTerminatingSessionId(null);
    },
    (err) => {
      // Eviction error callback (triggers rollback automatically)
      setErrorMsg(err);
      setTerminatingSessionId(null);
    }
  );

  const logoutAllMutation = useLogoutAllSessionsMutation(
    () => {
      onClose();
    },
    (err) => {
      setErrorMsg(err);
    }
  );

  // Esc key closure
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleEvictSession = (sessionId: string) => {
    setErrorMsg(null);
    setTerminatingSessionId(sessionId);
    logoutSessionMutation.mutate(sessionId);
  };

  const handleEvictAll = () => {
    if (window.confirm('Are you sure you want to terminate all other sessions? This will log you out from all other devices.')) {
      setErrorMsg(null);
      logoutAllMutation.mutate();
    }
  };

  // Helper to resolve device icons
  const getDeviceIcon = (session: Session) => {
    const deviceType = session.device?.toLowerCase() || '';
    const osType = session.os?.toLowerCase() || '';
    const browserType = session.browser?.toLowerCase() || '';

    if (deviceType.includes('phone') || deviceType.includes('mobile') || osType.includes('android') || osType.includes('ios')) {
      return <Smartphone className="w-5 h-5 text-violet-400" />;
    }
    if (deviceType.includes('tablet') || osType.includes('ipad')) {
      return <Smartphone className="w-5 h-5 text-purple-400" />;
    }
    if (osType.includes('windows') || osType.includes('mac') || osType.includes('linux')) {
      return <Laptop className="w-5 h-5 text-blue-400" />;
    }
    return <Monitor className="w-5 h-5 text-indigo-400" />;
  };

  // Helper to build nice device names
  const formatDeviceName = (session: Session) => {
    const parts: string[] = [];
    const hasDevice = session.device && session.device !== 'unknown';
    const hasOS = session.os && session.os !== 'unknown';
    const hasBrowser = session.browser && session.browser !== 'unknown';

    if (hasDevice) parts.push(session.device);

    const labelOS = hasOS ? session.os : '';
    const labelBrowser = hasBrowser ? session.browser : '';

    let subDetail = '';
    if (labelOS && labelBrowser) {
      subDetail = `${labelOS} • ${labelBrowser}`;
    } else if (labelOS || labelBrowser) {
      subDetail = labelOS || labelBrowser;
    }

    if (hasDevice) {
      return {
        main: session.device,
        sub: subDetail || 'Web Session',
      };
    }

    return {
      main: subDetail || 'Web Session',
      sub: `IP: ${session.ip}`,
    };
  };

  // Format date helper
  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }) + ' at ' + date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (err) {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
      ></div>

      {/* Modal Dialog */}
      <div className="glass-card w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl z-10 animate-scale-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Network className="w-5 h-5 text-brand-400" />
              <span>Active Sessions</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Review and manage devices currently signed into your account.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg p-3.5 text-sm flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-300">Action Failed</p>
                <p className="mt-0.5 text-xs text-red-400">{errorMsg}</p>
              </div>
            </div>
          )}

          {queryError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg p-3.5 text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span>Failed to fetch sessions. Please refresh.</span>
            </div>
          )}

          {isLoading ? (
            /* Skeleton Loading States */
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-4 flex items-center justify-between animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-800"></div>
                    <div className="space-y-2">
                      <div className="h-4 w-32 bg-slate-800 rounded"></div>
                      <div className="h-3 w-48 bg-slate-800 rounded"></div>
                    </div>
                  </div>
                  <div className="w-20 h-8 bg-slate-800 rounded"></div>
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Globe className="w-12 h-12 mx-auto mb-2 text-slate-700" />
              <p>No active sessions detected.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const deviceNames = formatDeviceName(session);
                const isTerminating = terminatingSessionId === session.sessionId;

                return (
                  <div
                    key={session.sessionId}
                    className={`border rounded-xl p-4 flex items-center justify-between transition-all duration-200 ${session.isCurrent
                      ? 'bg-brand-500/5 border-brand-500/30 shadow-inner'
                      : 'bg-slate-900/40 border-slate-850 hover:bg-slate-900/60'
                      }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Device type icon wrapper */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${session.isCurrent ? 'bg-brand-500/10' : 'bg-slate-800/80'
                        }`}>
                        {getDeviceIcon(session)}
                      </div>

                      {/* Detail texts */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-200 truncate">
                            {deviceNames.main}
                          </span>
                          {session.isCurrent && (
                            <span className="text-[10px] bg-brand-600/20 text-brand-300 font-bold px-2 py-0.5 rounded-full border border-brand-500/30">
                              Current Session
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {deviceNames.sub}
                        </p>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1">
                          <Calendar className="w-3 h-3" />
                          <span>Started: {formatTimestamp(session.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action terminate button */}
                    {session.isCurrent && <button
                      onClick={() => handleEvictSession(session.sessionId)}
                      disabled={isTerminating || logoutSessionMutation.isPending || logoutAllMutation.isPending}
                      className={`ml-4 p-2 rounded-lg shrink-0 transition-colors ${session.isCurrent
                        ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
                        : 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'
                        }`}
                      title={session.isCurrent ? 'Log out from this device' : 'Terminate session'}
                    >
                      {isTerminating ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {/* <div className="px-6 py-4 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between">
          <button
            onClick={handleEvictAll}
            disabled={sessions.length <= 1 || logoutAllMutation.isPending || logoutSessionMutation.isPending}
            className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {logoutAllMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LogOut className="w-3.5 h-3.5" />
            )}
            <span>Log out all devices</span>
          </button>

          <button
            onClick={onClose}
            className="btn-secondary text-xs px-4 py-2"
          >
            Close
          </button>
        </div> */}
      </div>
    </div>
  );
};
