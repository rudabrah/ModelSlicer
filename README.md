# 🔪 ModelSlicer 3D
**Det ultimate nettverktøyet for formbar 3D-slicing og forberedelse til 3D-print.**

ModelSlicer er født ut av behovet for å kunne dele opp store STL/3MF-filer lokalt i nettleseren, med kontroll over hvordan delene passer sammen. I stedet for bare rette kutt, lar dette verktøyet deg "designe" snittet for å skape sterke, mekaniske sammenføyninger.

---

## 🚀 Hovedfunksjoner (Session Update: 2026-04-05)

### 1. Multi-Tool Kuttesystem
Systemet støtter nå ubegrenset antall kutteverktøy samtidig.
- **+ Ny Boks:** Legg til flere uavhengige kuttebokser i scenen.
- **Auto-fokus:** Trykk på ønsket boks for å flytte gizmo-kontrollene dit umiddelbart.
- **Batch Processing:** Kutt utføres mot alle aktive verktøy samtidig.

### 2. Snap to Face (🎯)
Hurtigplassering av kuttebokser på modellens overflate.
- Aktiver **Snap to Face** og klikk på fjeset på modellen.
- Verktøyet flytter seg automatisk og roterer for å flukte med overflatens normal.

### 3. Formbare Kutt (Zigzag & Kurver)
I **Tegn Snitt**-modus kan du manipulere punkter på veggene for å skape komplekse profiler (puslespill-ledd, mekaniske låser).

### 4. Smart Visualisering & Ghosting
Modellen lyser opp blått der snittet vil treffe, for 100% nøyaktighet før utførelse.

![Final UI State](/public/screenshots/final_ui_state.png)

---

## 🛠 Bruksanvisning

1. **Last inn:** Dra og slipp en `.stl` eller `.3mf` fil.
2. **Plasser:** Bruk transform-kontroller (**W, E, R**) eller **🎯 Snap to Face**.
3. **Form Snittet:** 
    - Trykk **T** til du styrer "Kutteboks". 
    - Bytt til **Tilpasset Snitt** i sidepanelet for å tegne egne profiler.
4. **Utfør Kutt:** Trykk på den store knappen **"Kutt Aktiv Del"**.
5. **Eksporter:** Bruk download-ikonet i delelisten.

---

## ⌨️ Hurtigtaster
| Tast | Funksjon |
|------|----------|
| **W / E / R** | Flytte / Rote / Skaler boks |
| **[T]** | Rotasjon av kontroll-fokus (Boks <-> Modell <-> Snittfjes) |
| **Piltaster** | Finjustering av posisjon (Aktiv boks) |
| **Shift + Pil** | Finjustering av rotasjon (Aktiv boks) |
| **Alt + Scroll**| Skalering av aktiv del eller boks (avhengig av fokus) |

---

## 💻 Installasjon for utviklere

Prosjektet er bygget med **React** og **Vite** for ekstrem ytelse.

```bash
# Clone prosjektet
git clone https://github.com/[ditt-brukernavn]/ModelSlicer.git

# Installer avhengigheter
npm install

# Kjør utviklingsserver
npm run dev
```

## 🏗 Teknologier
- [Three.js](https://threejs.org/) - 3D Engine
- [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg) - Boolean matematikk
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) - React bro for Three.js
- [Vite](https://vitejs.dev/) - Frontend Tooling

---

## 📅 Siste Sesjon (2026-04-05)
**Status: Fullført Avansert Slicing-sprint**

### Oppdateringer:
- **Refaktorert Arkitektur:** Gått fra én global boks til et dynamisk `cuttingTools`-array. Dette muliggjør komplekse kutt-oppsett.
- **Snap to Face:** Implementert Raycasting-logikk for å "snappe" verktøy til modellens overflate.
- **Feilretting:** Løst problem med uthuling (shelling) som krasjet på store filer. Merk: Funksjonen ble til slutt fjernet som redundant etter brukerønske.
- **Fokus-logikk:** Forbedret `handleKeyDown` med `activeToolId`-tracking for å unngå "stale closures".

### Neste Steg:
- [ ] Implementere eksport til flere formater (.OBJ, .PLY).
- [ ] Legge til måleverktøy for avstand mellom to punkter.
- [ ] Optimalisere CSG-beregning for ekstremt store mesh (100MB+).

---

*Utviklet med ⚡ av Antigravity / Gemini.*
