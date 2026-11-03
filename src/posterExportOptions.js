// Keep poster artwork proportions 4:5 at every export resolution.
// PNG is truly lossless. JPEG trades a small amount of fidelity for much
// smaller files, which is useful for print shops and easy sharing.
export const POSTER_EXPORT_PRESETS = [
  {id:'standard-png',label:'Standard PNG · 1080 × 1350',shortLabel:'Standard PNG',width:1080,height:1350,mime:'image/png',extension:'png',quality:1},
  {id:'ultra-png',label:'Ultra Clear PNG · 2160 × 2700',shortLabel:'Ultra PNG',width:2160,height:2700,mime:'image/png',extension:'png',quality:1},
  {id:'max-png',label:'Maximum Clear PNG · 3240 × 4050',shortLabel:'Maximum PNG',width:3240,height:4050,mime:'image/png',extension:'png',quality:1},
  {id:'ultra-jpg',label:'Optimized JPEG · 2160 × 2700',shortLabel:'Optimized JPEG',width:2160,height:2700,mime:'image/jpeg',extension:'jpg',quality:.95},
  {id:'print-jpg',label:'Flex Print JPEG · 3240 × 4050',shortLabel:'Flex Print JPEG',width:3240,height:4050,mime:'image/jpeg',extension:'jpg',quality:.96},
];

export const DEFAULT_POSTER_EXPORT_PRESET='max-png';

export function getPosterExportPreset(id){
  return POSTER_EXPORT_PRESETS.find(preset=>preset.id===id) ||
    POSTER_EXPORT_PRESETS.find(preset=>preset.id===DEFAULT_POSTER_EXPORT_PRESET);
}

export function posterExportFilename(preset,page,total){
  const base='msf-poster-'+preset.id;
  return total>1
    ?`${base}-page-${String(page+1).padStart(2,'0')}.${preset.extension}`
    :`${base}.${preset.extension}`;
}

export function fileSizeLabel(bytes){
  if(!Number.isFinite(bytes)||bytes<0)return '';
  return bytes>=1048576?`${(bytes/1048576).toFixed(2)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`;
}
