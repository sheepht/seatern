import ReactGA from 'react-ga4';
import posthog from 'posthog-js';

let initialized = false;

export function initGA(): void {
  if (initialized) return;

  const gaId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
  const phKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const phHost =
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
    'https://us.i.posthog.com';

  if (gaId) {
    ReactGA.initialize(gaId, {
      gtagOptions: { send_page_view: false },
    });
  }

  if (phKey) {
    posthog.init(phKey, {
      api_host: phHost,
      capture_pageview: false,
      autocapture: true,
      persistence: 'localStorage+cookie',
      session_recording: {
        maskAllInputs: false,
        maskTextSelector: '[data-ph-mask]',
      },
    });
  }

  if (gaId || phKey) initialized = true;
}

export function trackPageview(path: string): void {
  if (!initialized) return;

  if (import.meta.env.VITE_GA_MEASUREMENT_ID) {
    ReactGA.send({ hitType: 'pageview', page: path, title: document.title });
  }

  if (import.meta.env.VITE_POSTHOG_KEY) {
    posthog.capture('$pageview', {
      $current_url: window.location.href,
      path,
    });
  }
}

export function trackEvent(
  name: string,
  params?: Record<string, unknown>,
): void {
  if (!initialized) return;

  if (import.meta.env.VITE_GA_MEASUREMENT_ID) {
    ReactGA.event(name, params);
  }

  if (import.meta.env.VITE_POSTHOG_KEY) {
    posthog.capture(name, params);
  }
}
