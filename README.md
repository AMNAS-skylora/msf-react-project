# MSF Committee React Website

React 19 + Vite mobile-first website. 28 portraits cropped from the user-provided poster.

## Run
```bash
npm install
npm run dev
```
Open the localhost URL shown by Vite. Build with `npm run build`; deploy `dist/` to Netlify, or import the repo in Vercel (framework Vite).

## Features
- Responsive leadership and committee sections, member search and role filters
- Hide/show photos
- Photo upload, restore, download, and AI background removal (Edit photos)
- Edited photos saved in browser localStorage only (not shared across visitors or devices)
- Original images live in `public/assets`; names/roles in `src/members.json`

## Important
AI background removal is downloaded on demand and requires internet; large models may be slow on phones. Confirm names, roles, image rights and publication permission before public deployment. No backend, account system or shared admin storage is included.
