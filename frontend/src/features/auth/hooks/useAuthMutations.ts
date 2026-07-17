import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { axiosClient } from '../../../api/axiosClient';
import { useAuth } from '../../../context/AuthContext';
import {
  ApiResponse,
  LoginResponseData,
  Session,
} from '../types/auth.types';

// Zod schemas variables will be defined here or imported. For now we use parameters:
export interface LoginParams {
  emailOrUsername: string;
  password?: string;
}

export interface SignupParams {
  name: string;
  username: string;
  email: string;
  password?: string;
}

/**
 * Hook for login mutation
 */
export const useLoginMutation = (onErrorCallback?: (message: string) => void) => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: Required<LoginParams>) => {
      const response = await axiosClient.post<ApiResponse<LoginResponseData>>(
        '/auth/login',
        {
          emailOrUsername: credentials.emailOrUsername,
          password: credentials.password,
        }
      );
      return response.data;
    },
    onSuccess: (response) => {
      const { accessToken, user } = response.data;
      login(accessToken, user);

      // Invalidate active sessions to trigger fresh load
      queryClient.invalidateQueries({ queryKey: ['sessions'] });

      navigate('/dashboard');
    },
    onError: (error: any) => {
      const errorMsg = error.response?.data?.message || 'Login failed. Please try again.';
      if (onErrorCallback) {
        onErrorCallback(errorMsg);
      }
    },
  });
};

/**
 * Hook for signup mutation which logs the user in automatically after success
 */
export const useSignupMutation = (onErrorCallback?: (message: string) => void) => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: Required<SignupParams>) => {
      // 1. Perform Signup Registration (does not return tokens)
      await axiosClient.post<ApiResponse<any>>('/auth/signup', {
        name: credentials.name,
        username: credentials.username,
        email: credentials.email,
        password: credentials.password,
      });

      // 2. Perform Login behind the scenes using credentials
      const loginResponse = await axiosClient.post<ApiResponse<LoginResponseData>>(
        '/auth/login',
        {
          emailOrUsername: credentials.email,
          password: credentials.password,
        }
      );
      return loginResponse.data;
    },
    onSuccess: (response) => {
      const { accessToken, user } = response.data;
      login(accessToken, user);

      queryClient.invalidateQueries({ queryKey: ['sessions'] });

      navigate('/dashboard');
    },
    onError: (error: any) => {
      const errorMsg = error.response?.data?.message || 'Signup failed. Please try again.';
      if (onErrorCallback) {
        onErrorCallback(errorMsg);
      }
    },
  });
};

/**
 * Hook for retrieving active device sessions. Polls every 10 seconds for real-time consistency.
 */
export const useFetchSessionsQuery = () => {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const query = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: async () => {
      const response = await axiosClient.get<ApiResponse<Session[]>>('/auth/sessions');
      return response.data.data;
    },
    enabled: isAuthenticated,
    refetchInterval: 10000, // Poll every 10 seconds
    refetchOnWindowFocus: true, // Refetch when window is focused
  });

  const sessions = query.data;

  useEffect(() => {
    // If authenticated and sessions list is loaded, but current session is missing, log out
    if (isAuthenticated && sessions) {
      const hasCurrent = sessions.some((s) => s.isCurrent);
      if (!hasCurrent) {
        logout();
        navigate('/login', {
          state: { message: 'This session has been terminated from another device.' },
        });
      }
    }
  }, [sessions, isAuthenticated, logout, navigate]);

  return query;
};

/**
 * Hook for logging out a specific session with optimistic UI updates & rollback
 */
export const useLogoutSessionMutation = (
  onSuccessCallback?: () => void,
  onErrorCallback?: (message: string) => void
) => {
  const queryClient = useQueryClient();
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await axiosClient.post<ApiResponse<any>>('/auth/logout', {
        sessionId,
      });
      return { sessionId, data: response.data };
    },
    onMutate: async (sessionId) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['sessions'] });

      // Snapshot the previous value
      const previousSessions = queryClient.getQueryData<Session[]>(['sessions']);

      // Optimistically update by removing the terminated session
      if (previousSessions) {
        queryClient.setQueryData<Session[]>(
          ['sessions'],
          previousSessions.filter((s) => s.sessionId !== sessionId)
        );
      }

      // Return a context object with the snapshotted value
      return { previousSessions };
    },
    onError: (err: any, sessionId, context) => {
      // Rollback to the previous value if mutation fails
      if (context?.previousSessions) {
        queryClient.setQueryData(['sessions'], context.previousSessions);
      }

      const errorMsg = err.response?.data?.message || 'Failed to terminate session.';
      if (onErrorCallback) {
        onErrorCallback(errorMsg);
      }
    },
    onSuccess: (result, sessionId, context) => {
      // Find the session that was terminated in our captured list to see if it was the current one
      const previousSessions = context?.previousSessions || [];
      const sessionToTerminate = previousSessions.find((s) => s.sessionId === sessionId);
      const wasCurrent = sessionToTerminate?.isCurrent === true;

      // If we terminated the current session, clean up auth context and route to login
      if (wasCurrent) {
        logout();
        navigate('/login');
      } else {
        if (onSuccessCallback) {
          onSuccessCallback();
        }
      }
    },
    onSettled: () => {
      // Refetch sessions from server
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
};

/**
 * Hook for logging out of all active devices
 */
export const useLogoutAllSessionsMutation = (
  onSuccessCallback?: () => void,
  onErrorCallback?: (message: string) => void
) => {
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async () => {
      const response = await axiosClient.post<ApiResponse<any>>('/auth/logout', {
        all: true,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.setQueryData(['sessions'], []);
      logout();
      navigate('/login');
      if (onSuccessCallback) {
        onSuccessCallback();
      }
    },
    onError: (err: any) => {
      const errorMsg = err.response?.data?.message || 'Failed to terminate all sessions.';
      if (onErrorCallback) {
        onErrorCallback(errorMsg);
      }
    },
  });
};
