/**
 * Centralized API Configuration & Client
 * Single source of truth for all backend API calls
 */

// API Base URL from environment variable
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7071';

/**
 * Generic API client with auth header injection
 */
export class ApiClient {
  private baseURL: string;
  private token: string | null;

  constructor(baseURL: string = API_BASE_URL, token: string | null = null) {
    this.baseURL = baseURL;
    this.token = token;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private getHeaders(contentType: string = 'application/json'): Headers {
    const headers = new Headers();
    headers.append('Content-Type', contentType);
    if (this.token) {
      headers.append('Authorization', `Bearer ${this.token}`);
    }
    return headers;
  }

  async get<T = any>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async post<T = any>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async patch<T = any>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async delete<T = any>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }
}

// Export a singleton instance
export const apiClient = new ApiClient();
