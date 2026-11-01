# MSF Mambadumoola Unit Committee — React Website

A complete mobile-first React 19 + Vite 6 website with 28 members, MSF-inspired green-and-white styling, search and filtering, and browser-based photo editing.

## Requirements
- Node.js 18+ (Node 20 LTS recommended)
- npm and internet access for first installation

## Run locally
```bash
git clone https://github.com/amnas-cubixmet/msf-react-project.git
cd msf-react-project
npm install
npm run dev
```
Open the address printed by Vite, usually http://localhost:5173. Production:
```bash
npm run build
npm run preview
```

Deploy to Vercel as **Vite**, build command **npm run build**, output directory **dist**. No environment variables are needed for this static site.

## Structure
- `public/assets/`: 28 original cropped portraits
- `src/components/`: Header, Hero, MemberCard, SectionHeading, Footer
- `src/data/members.json`: Names, roles, image locations
- `src/data/committee.js`: Role groups and stable IDs
- `src/hooks/useStoredPhotos.js`: Browser-local photo persistence
- `src/utils/photos.js`: Upload optimization, downloads
- `src/App.jsx`: Main pages and actions
- `src/styles.css`: Responsive site styles
- `.gitignore`: Excludes dependencies, build output, local secrets

## Editing
Click **Edit photos** in the Committee section, then use card actions to upload, remove background, restore, or download. Background removal uses `@imgly/background-removal` and requires model download and modern browser memory. Edits are saved in this browser's localStorage only. To publish changes for everyone, replace images in `public/assets/`, commit, and redeploy.

Modify `src/data/members.json` to edit names and roles (`leadership`, `vice`, `joint`, `executive`). Image paths are relative to `public/`.

## ECONNRESET
`npm install` may fail because the connection to registry.npmjs.org resets. Check internet connectivity, then try:
```bash
npm config set registry https://registry.npmjs.org/
npm cache verify
npm install --fetch-retries=5 --fetch-retry-mintimeout=20000
```
Only delete npm proxy config when the network does not require a proxy.

## Publishing notes
Portraits were cropped from a supplied poster. Confirm names, titles, and photo permissions. This project has no authentication/backend. Client-side photo edits are not shared with visitors.
