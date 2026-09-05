import { useEffect } from 'react';

/**
 * Reusable auto-save draft hook.
 * Saves form state to sessionStorage every 5 seconds so patient data, vitals,
 * and consultation notes are never lost even if the screen locks or user steps away.
 */
export function useAutoSaveDraft(draftKey, formData, setFormData, intervalMs = 5000) {
  // 1. On mount: restore draft if exists
  useEffect(() => {
    if (!draftKey || !setFormData) return;
    try {
      const saved = sessionStorage.getItem(`dcms.draft.${draftKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          setFormData((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch (_e) {
      /* ignore JSON parse errors */
    }
  }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Every 5 seconds: auto-save form data
  useEffect(() => {
    if (!draftKey || !formData) return;
    const timer = setInterval(() => {
      try {
        sessionStorage.setItem(`dcms.draft.${draftKey}`, JSON.stringify(formData));
      } catch (_e) {
        /* ignore storage quota errors */
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [draftKey, formData, intervalMs]);
}

/** Helper to clear draft after successful submission */
export function clearDraft(draftKey) {
  if (draftKey) {
    try {
      sessionStorage.removeItem(`dcms.draft.${draftKey}`);
    } catch (_e) {
      /* ignore */
    }
  }
}
