import ReactGA from 'react-ga4';
import posthog from 'posthog-js';

let initialized = false;

export function initGA(): void {
  if (initialized) return;

  const gaId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
  const phKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

  if (gaId) {
    ReactGA.initialize(gaId, {
      gtagOptions: { send_page_view: false },
    });
  }

  if (phKey) {
    // 透過自家 domain 的 /ingest reverse proxy 繞開廣告攔截器
    // （vercel.json 和 vite.config.ts 都有對應 rewrite 設定）
    posthog.init(phKey, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
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
