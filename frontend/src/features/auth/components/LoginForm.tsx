import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLoginMutation } from '../hooks/useAuthMutations';
import { loginSchema, LoginInputs } from '../validations/auth.schema';
import { Eye, EyeOff, Lock, Mail, Loader2, AlertCircle } from 'lucide-react';

export const LoginForm: React.FC = () => {
  const location = useLocation();
  const redirectMessage = location.state?.message;

  const [formValues, setFormValues] = useState<LoginInputs>({
    emailOrUsername: '',
    password: '',
  });
  
  const [errors, setErrors] = useState<Partial<Record<keyof LoginInputs, string>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const loginMutation = useLoginMutation((errorMsg) => {
    setServerError(errorMsg);
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const fieldName = name as keyof LoginInputs;
    setFormValues((prev) => ({ ...prev, [fieldName]: value }));
    // Clear field-specific error as user types
    if (errors[fieldName]) {
      setErrors((prev) => ({ ...prev, [fieldName]: undefined }));
    }
    setServerError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    const result = loginSchema.safeParse(formValues);

    if (!result.success) {
      const fieldErrors: Partial<Record<keyof LoginInputs, string>> = {};
      result.error.errors.forEach((err) => {
        const pathKey = err.path[0];
        if (typeof pathKey === 'string' && pathKey in formValues) {
          fieldErrors[pathKey as keyof LoginInputs] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    loginMutation.mutate({
      emailOrUsername: result.data.emailOrUsername,
      password: result.data.password,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in" noValidate>
      {redirectMessage && !serverError && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-lg p-3.5 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <span>{redirectMessage}</span>
        </div>
      )}

      {serverError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg p-3.5 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      <div>
        <label htmlFor="emailOrUsername" className="block text-sm font-medium text-slate-300 mb-1.5">
          Email or Username
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Mail className="w-5 h-5" />
          </span>
          <input
            id="emailOrUsername"
            name="emailOrUsername"
            type="text"
            className={`glass-input pl-11 ${errors.emailOrUsername ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30' : ''}`}
            placeholder="dev_jane or jane@example.com"
            value={formValues.emailOrUsername}
            onChange={handleChange}
            disabled={loginMutation.isPending}
          />
        </div>
        {errors.emailOrUsername && (
          <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-red-400"></span>
            {errors.emailOrUsername}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
          Password
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Lock className="w-5 h-5" />
          </span>
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            className={`glass-input pl-11 pr-11 ${errors.password ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30' : ''}`}
            placeholder="••••••••"
            value={formValues.password}
            onChange={handleChange}
            disabled={loginMutation.isPending}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
            onClick={() => setShowPassword(!showPassword)}
            disabled={loginMutation.isPending}
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
        {errors.password && (
          <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-red-400"></span>
            {errors.password}
          </p>
        )}
      </div>

      <button
        type="submit"
        className="btn-primary mt-2"
        disabled={loginMutation.isPending}
      >
        {loginMutation.isPending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Signing in...</span>
          </>
        ) : (
          <span>Sign In</span>
        )}
      </button>
    </form>
  );
};
