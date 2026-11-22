# 🚌 Where is my BUS — Real-Time Transit & Live Bus Tracker

A mobile-first, lightweight **Progressive Web App (PWA)** built with **React 18, TypeScript, Tailwind CSS, and Vite** for Origin ➔ Destination transit planning, instant bus number lookup, live GPS stop-by-stop tracking, and offline-first saved routes across **Hyderabad, Bengaluru, and Delhi NCR**.

---

## ✨ Key Features

1. **Origin ➔ Destination Search & Multi-Time-Slot Planner (`SmartSearchHero` + `PlannedJourneysPanel`)**
   - Search door-to-door journeys directly from the Home screen using station names, stop `#codes`, landmarks, GPS location, or multilingual voice search (English, Hindi, Kannada, Telugu).
   - Compare buses across **Nearest**, **Morning**, **Afternoon**, **Evening**, and **Night** departure bands with accurate IST timezone & cross-midnight GTFS duration calculations.
2. **Minimalist, Zero-Map-Clutter Home Experience (`HomeTab`)**
   - Ultra-compact logo-only header (`h-12` / `h-14`), quick-access horizontal favorite cards, and narrow-screen (`< 380px`) responsive recommended route cards.
   - Interactive Leaflet maps (`UnifiedTransitMap`) are dynamically code-split (`React.lazy`) and loaded **only on demand** when viewing a route on the map.
3. **Dedicated Bus Number Search & Live Stop Timeline (`SearchTab` + `LiveBusTimeline`)**
   - Instant lookup for bus numbers (`216`, `222A`, `10H`, `113M`, `49M`, `V-500D / AC Vajra`, `KIA-9`) and stops with category filters (`All`, `AC`, `Electric`, `Metro Express`, `Ordinary`, `Airport`).
   - Real-time vertical stop timeline showing **passed**, **pulsing current**, and **upcoming** stops with live ETAs and an optional **"Show Map"** toggle.
4. **Saved Favorite Routes (`SavedRoutesTab` + `useFavoriteRoutes`)**
   - Offline-first `localStorage` persistence, one-tap star bookmarking (`48×48px` WCAG touch targets), up/down reordering, and swipe-to-delete on mobile.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript 5, Tailwind CSS 3
- **Maps (On-Demand Chunk)**: Leaflet + React-Leaflet
- **Icons**: Lucide React
- **Build Tool**: Vite 5 + PWA Service Worker (`public/sw.js` & `public/manifest.webmanifest`)

---

## 🚀 Local Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Run strict TypeScript check
npm run typecheck

# Build production bundle
npm run build
```

---

## 🌐 Deployment (Vercel / Netlify / Cloudflare Pages)

This repository includes [`vercel.json`](./vercel.json) pre-configured for zero-config deployment:
- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables Required**: None (uses public OpenStreetMap / Overpass / Nominatim / OSRM transit endpoints out of the box).
