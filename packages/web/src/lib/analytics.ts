import ReactGA from 'react-ga4';

let initialized = false;

export function initGA(): void {
  if (initialized) return;
  const id = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
  if (!id) return;

  ReactGA.initialize(id, {
    gtagOptions: { send_page_view: false },
  });

  initialized = true;
}

export function trackPageview(path: string): void {
  if (!initialized) return;
  ReactGA.send({
    hitType: 'pageview',
    page: path,
    title: document.title,
  });
}

export function trackEvent(
  name: string,
  params?: Record<string, unknown>,
): void {
  if (!initialized) return;
  ReactGA.event(name, params);
}
