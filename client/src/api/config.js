// API base URL. In development this is empty (the Vite proxy forwards /api to
// :4000). In production builds, set VITE_API_URL to the API origin, e.g.
//   VITE_API_URL=https://api.chooseyour100.com npm run build
export const API_BASE = (import.meta.env && import.meta.env.VITE_API_URL) || '';