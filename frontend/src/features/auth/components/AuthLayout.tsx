import React, { useState } from 'react';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { ShieldCheck } from 'lucide-react';

export const AuthLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-slate-950">
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-[460px] z-10">
        {/* Brand header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white font-sans bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
            TaskPilot
          </h1>
          <p className="text-sm text-slate-400 mt-1.5 font-medium">
            internal project management system
          </p>
        </div>

        {/* Auth Glass Card */}
        <div className="glass-card rounded-2xl p-6 sm:p-8 animate-slide-up">
          {/* Tabs */}
          <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800/60 mb-6">
            <button
              onClick={() => setActiveTab('login')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${activeTab === 'login'
                ? 'bg-slate-800 text-white shadow-md shadow-slate-950/50'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setActiveTab('signup')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${activeTab === 'signup'
                ? 'bg-slate-800 text-white shadow-md shadow-slate-950/50'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              Register
            </button>
          </div>

          {/* Form wrapper */}
          <div className="min-h-[260px]">
            {activeTab === 'login' ? <LoginForm /> : <SignupForm />}
          </div>
        </div>
      </div>
    </div>
  );
};
