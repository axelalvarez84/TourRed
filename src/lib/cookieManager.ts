export type ConsentType = 'all' | 'essential-only' | null;

const CONSENT_KEY = 'cookie_consent';
const SESSION_ID_KEY = 'session_id';

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

export function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

export function getConsent(): ConsentType {
  const consent = localStorage.getItem(CONSENT_KEY);
  if (consent === 'all' || consent === 'essential-only') {
    return consent;
  }
  return null;
}

export function setConsent(consent: ConsentType): void {
  if (consent) {
    localStorage.setItem(CONSENT_KEY, consent);
  } else {
    localStorage.removeItem(CONSENT_KEY);
  }
}

export function hasConsent(): boolean {
  return getConsent() !== null;
}

export function canUseAnalytics(): boolean {
  return getConsent() === 'all';
}

export function clearNonEssentialCookies(): void {
  const essentialKeys = ['sb-', 'cookie_consent', 'session_id'];

  Object.keys(localStorage).forEach(key => {
    const isEssential = essentialKeys.some(prefix => key.startsWith(prefix));
    if (!isEssential) {
      localStorage.removeItem(key);
    }
  });
}

export async function recordConsent(
  consentType: 'all' | 'essential-only',
  userId: string | null
): Promise<void> {
  const sessionId = getSessionId();

  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/cookie_consents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        user_id: userId,
        session_id: sessionId,
        consent_type: consentType,
        user_agent: navigator.userAgent
      })
    });

    if (!response.ok) {
      console.warn('Failed to record consent:', response.statusText);
    }
  } catch (error) {
    console.warn('Failed to record consent:', error);
  }
}
