import { useEffect } from 'react';
import { track } from './tracker.js';

// Call at the top of a page component:  usePageView('jobs');
// Sends one page_view each time the page opens.
export function usePageView(page, properties) {
  const extra = JSON.stringify(properties ?? {});

  useEffect(() => {
    track('page_view', { page, ...JSON.parse(extra) });
  }, [page, extra]);
}