const backendBaseUrl = import.meta.env.VITE_BACKEND_URL;

function shouldRewriteBackendUrl(): boolean {
  return Boolean(
    import.meta.env.DEV &&
      backendBaseUrl &&
      typeof window !== 'undefined'
  );
}

export function rewriteBackendUrlForDev(url: string): string {
  if (!shouldRewriteBackendUrl()) {
    return url;
  }

  try {
    const target = new URL(url);
    const backend = new URL(backendBaseUrl!);

    if (target.host === backend.host && target.protocol === backend.protocol) {
      return `${window.location.origin}${target.pathname}${target.search}`;
    }
  } catch {
    return url;
  }

  return url;
}
