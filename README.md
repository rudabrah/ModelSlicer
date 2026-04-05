# 🔪 ModelSlicer 3D
**Det ultimate nettverktøyet for formbar 3D-slicing og forberedelse til 3D-print.**

ModelSlicer er født ut av behovet for å kunne dele opp store STL/3MF-filer lokalt i nettleseren, med kontroll over hvordan delene passer sammen. I stedet for bare rette kutt, lar dette verktøyet deg "designe" snittet for å skape sterke, mekaniske sammenføyninger.

---

## 🚀 Hovedfunksjoner

### 1. Formbare Kutt (Zigzag & Kurver)
Glem kjedelige, flate kutt. I **Tegn Snitt**-modus kan du legge til knekkpunkter på alle fire sider av kutteboksen for å lage:
- **Puslespill-ledd:** For bedre liming og styrke.
- **Zigzag-mønster:** For å unngå å snitte gjennom skjøre detaljer.
- **Custom profiler:** Form kutte-verktøyet nøyaktig slik modellen din krever.

### 2. Multi-Object Scene Management
Last inn flere modeller samtidig. Du kan flytte, skalere og rotere hver del individuelt, og utføre kutt på den aktive delen uten at det påvirker de andre.

### 3. Smart Visualisering (Ghost Selection)
Når du beveger kutteboksen, vil innsiden av modellen lyse opp i en dus blåfarge. Dette gir deg 100% nøyaktig oversikt over nøyaktig hva som blir med i snittet før du trykker på knappen.

### 4. 100% Privat & Lokal (Client-Side)
Ingen modeller lastes opp til en server. All tung 3D-matematikk (CSG/Boolean) skjer direkte i din egen nettleser ved hjelp av Web Workers og avansert spatial indexing (BVH).

---

## 🛠 Bruksanvisning

1. **Last inn:** Dra og slipp en `.stl` eller `.3mf` fil inn i vinduet.
2. **Plasser:** Bruk flytteverktøyet (**W, E, R**) for å legge den røde boksen der du vil kutte.
3. **Form Snittet:** 
   - Trykk **T** til du er i "Tegn Snitt"-modus. 
   - Legg til punkter på veggene (Topp/Bunn/Sider) og dra i dem for å lage ønsket form.
4. **Utfør Kutt:** Trykk på den store røde knappen **"Kutt Aktiv Del"**.
5. **Separer:** Trykk **T** for å gå over til "Flyt Modell", og dra delene fra hverandre for å inspisere resultatet.
6. **Eksporter:** Trykk **"Last ned"** i dele-listen til høyre for å få filene klare for din 3D-slicer (Cura, PrusaSlicer, etc).

---

## ⌨️ Hurtigtaster
| Tast | Funksjon |
|------|----------|
| **W** | Flytte-modus (Translate) |
| **E** | Rotere-modus (Rotate) |
| **R** | Skalerings-modus (Scale) |
| **T** | Bla mellom verktøy (Boks -> Modell -> Tegn Snitt) |

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

*Utviklet med ⚡ av Antigravity / Gemini.*
