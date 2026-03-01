const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

class ApiError extends Error {
  status: number;
  detail: string;
  
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const token = getAuthToken();
  const { method = 'GET', body, headers = {}, signal } = options;

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(response.status, error.detail || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

const api = {
  get: <T>(endpoint: string, signal?: AbortSignal) => 
    request<T>(endpoint, { signal }),

  post: <T>(endpoint: string, body: unknown, signal?: AbortSignal) => 
    request<T>(endpoint, { method: 'POST', body, signal }),

  put: <T>(endpoint: string, body: unknown, signal?: AbortSignal) => 
    request<T>(endpoint, { method: 'PUT', body, signal }),

  patch: <T>(endpoint: string, body: unknown, signal?: AbortSignal) => 
    request<T>(endpoint, { method: 'PATCH', body, signal }),

  delete: <T>(endpoint: string, signal?: AbortSignal) => 
    request<T>(endpoint, { method: 'DELETE', signal }),

  upload: async <T>(endpoint: string, formData: FormData, signal?: AbortSignal): Promise<T> => {
    const token = getAuthToken();
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
      signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new ApiError(response.status, error.detail || 'Upload failed');
    }

    const text = await response.text();
    if (!text) return undefined as T;
    
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  },
};

export { api, ApiError, request, getAuthToken };
export type { RequestOptions };
