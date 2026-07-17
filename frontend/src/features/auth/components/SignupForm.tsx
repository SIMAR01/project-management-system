import React, { useState } from 'react';
import { useSignupMutation } from '../hooks/useAuthMutations';
import { signupSchema, SignupInputs } from '../validations/auth.schema';
import { Eye, EyeOff, Lock, Mail, User, ShieldAlert, Check, X, Loader2, AlertCircle } from 'lucide-react';

export const SignupForm: React.FC = () => {
  const [formValues, setFormValues] = useState<SignupInputs>({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof SignupInputs, string>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const signupMutation = useSignupMutation((errorMsg) => {
    setServerError(errorMsg);
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const fieldName = name as keyof SignupInputs;
    setFormValues((prev) => ({ ...prev, [fieldName]: value }));
    if (errors[fieldName]) {
      setErrors((prev) => ({ ...prev, [fieldName]: undefined }));
    }
    setServerError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    const result = signupSchema.safeParse(formValues);

    if (!result.success) {
      const fieldErrors: Partial<Record<keyof SignupInputs, string>> = {};
      result.error.errors.forEach((err) => {
        const pathKey = err.path[0];
        if (typeof pathKey === 'string' && pathKey in formValues) {
          fieldErrors[pathKey as keyof SignupInputs] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    signupMutation.mutate({
      name: result.data.name,
      username: result.data.username,
      email: result.data.email,
      password: result.data.password,
    });
  };

  // Real-time password requirement evaluations
  const passVal = formValues.password;
  const isMinLength = passVal.length >= 6;
  const hasUppercase = /[A-Z]/.test(passVal);
  const hasNumber = /[0-9]/.test(passVal);

  const requirements = [
    { label: 'Minimum 6 characters', met: isMinLength },
    { label: 'At least one uppercase letter', met: hasUppercase },
    { label: 'At least one number', met: hasNumber },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in" noValidate>
      {serverError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg p-3.5 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1">
          Full Name
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <User className="w-5 h-5" />
          </span>
          <input
            id="name"
            name="name"
            type="text"
            className={`glass-input pl-11 ${errors.name ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30' : ''}`}
            placeholder="Jane Doe"
            value={formValues.name}
            onChange={handleChange}
            disabled={signupMutation.isPending}
          />
        </div>
        {errors.name && (
          <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-red-400"></span>
            {errors.name}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-1">
          Username
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <User className="w-5 h-5" />
          </span>
          <input
            id="username"
            name="username"
            type="text"
            className={`glass-input pl-11 ${errors.username ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30' : ''}`}
            placeholder="jane_doe"
            value={formValues.username}
            onChange={handleChange}
            disabled={signupMutation.isPending}
          />
        </div>
        {errors.username && (
          <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-red-400"></span>
            {errors.username}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
          Email Address
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Mail className="w-5 h-5" />
          </span>
          <input
            id="email"
            name="email"
            type="email"
            className={`glass-input pl-11 ${errors.email ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30' : ''}`}
            placeholder="jane@example.com"
            value={formValues.email}
            onChange={handleChange}
            disabled={signupMutation.isPending}
          />
        </div>
        {errors.email && (
          <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-red-400"></span>
            {errors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password-signup" className="block text-sm font-medium text-slate-300 mb-1">
          Password
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Lock className="w-5 h-5" />
          </span>
          <input
            id="password-signup"
            name="password"
            type={showPassword ? 'text' : 'password'}
            className={`glass-input pl-11 pr-11 ${errors.password ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30' : ''}`}
            placeholder="••••••••"
            value={formValues.password}
            onChange={handleChange}
            disabled={signupMutation.isPending}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
            onClick={() => setShowPassword(!showPassword)}
            disabled={signupMutation.isPending}
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
        {errors.password && (
          <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-red-400"></span>
            {errors.password}
          </p>
        )}

        {/* Real-time Checklist */}
        <div className="mt-2.5 p-2.5 bg-slate-950/40 rounded-lg border border-slate-800/60 space-y-1">
          <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1">Complexity Requirements</p>
          {requirements.map((req) => (
            <div key={req.label} className="flex items-center gap-2 text-xs">
              {req.met ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <X className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span className={req.met ? 'text-slate-300' : 'text-slate-500'}>{req.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-1">
          Confirm Password
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <ShieldAlert className="w-5 h-5" />
          </span>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            className={`glass-input pl-11 ${errors.confirmPassword ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30' : ''}`}
            placeholder="••••••••"
            value={formValues.confirmPassword}
            onChange={handleChange}
            disabled={signupMutation.isPending}
          />
        </div>
        {errors.confirmPassword && (
          <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-red-400"></span>
            {errors.confirmPassword}
          </p>
        )}
      </div>

      <button
        type="submit"
        className="btn-primary mt-2"
        disabled={signupMutation.isPending}
      >
        {signupMutation.isPending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Creating account...</span>
          </>
        ) : (
          <span>Create Account</span>
        )}
      </button>
    </form>
  );
};
