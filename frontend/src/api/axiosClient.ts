import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// In-memory access token storage to prevent XSS
let inMemoryToken = '';

export const getAccessToken = () => inMemoryToken;

export const setAccessToken = (token: string) => {
  inMemoryToken = token;
};

// Create the global Axios client
export const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

interface FailedRequest {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}

let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request Interceptor: Attach bearer token if it exists in-memory
axiosClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (!config.headers) {
      config.headers = {} as any;
    }
    if (token) {
      if (typeof config.headers.set === 'function') {
        config.headers.set('Authorization', `Bearer ${token}`);
      } else {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 Unauthorized errors with Refresh Token rotation
axiosClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;
    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Check if error is 401 Unauthorized
    const is401 = error.response?.status === 401;

    // Do NOT intercept if this is a login, signup, logout, or refresh-token call
    const isAuthEndpoint =
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/signup') ||
      originalRequest.url?.includes('/auth/logout') ||
      originalRequest.url?.includes('/auth/refresh-token');

    if (is401 && !isAuthEndpoint) {
      // If we are already refreshing, queue the request
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (!originalRequest.headers) {
              originalRequest.headers = {} as any;
            }
            if (typeof originalRequest.headers.set === 'function') {
              originalRequest.headers.set('Authorization', `Bearer ${token}`);
            } else {
              originalRequest.headers['Authorization'] = `Bearer ${token}`;
            }
            return axiosClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        // Call backend refresh-token endpoint to rotate/obtain new access token
        const refreshResponse = await axios.post<{
          success: boolean;
          data: { accessToken: string };
        }>(
          `${axiosClient.defaults.baseURL}/auth/refresh-token`,
          {},
          { withCredentials: true }
        );

        const newAccessToken = refreshResponse.data.data.accessToken;
        setAccessToken(newAccessToken);

        // Process queue with new token
        processQueue(null, newAccessToken);

        // Retry original request
        if (!originalRequest.headers) {
          originalRequest.headers = {} as any;
        }
        if (typeof originalRequest.headers.set === 'function') {
          originalRequest.headers.set('Authorization', `Bearer ${newAccessToken}`);
        } else {
          originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
        }
        return axiosClient(originalRequest);
      } catch (refreshError) {
        // Refresh token failed (e.g. expired/revoked)
        processQueue(refreshError, null);

        // Wipe in-memory token
        setAccessToken('');

        // Dispatch event so AuthContext/UI knows to log the user out and redirect
        window.dispatchEvent(new Event('auth:unauthorized'));

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
