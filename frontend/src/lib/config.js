// Empty string = use Vite dev proxy (/api → localhost:3001). Set VITE_API_BASE_URL in production.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
