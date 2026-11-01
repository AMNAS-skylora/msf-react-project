import { useEffect, useState } from 'react';

const KEY = 'msf-committee-photo-edits-v2';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function useStoredPhotos() {
  const [photos, setPhotos] = useState(read);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(photos));
      setSaveError('');
    } catch {
      setSaveError('Browser storage is full. Your photo may not remain after refresh.');
    }
  }, [photos]);

  function replace(id, dataUrl) {
    setPhotos((current) => ({ ...current, [id]: dataUrl }));
  }

  function restore(id) {
    setPhotos((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  return { photos, replace, restore, saveError };
}
