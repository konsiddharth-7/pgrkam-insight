import { track } from './tracker.js';

export { track } from './tracker.js';
export { usePageView } from './usePageView.js';

// Development only: lets you fire test events from the browser console
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__track = track;
}