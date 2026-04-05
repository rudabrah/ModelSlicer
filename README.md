# ModelSlicer 3D

Et kraftig, nettleser-basert verktøy for å kutte og manipulere 3D-modeller (.STL og .3MF) for 3D-printing. 

## Funksjoner
- **Interaktiv 3D-visning:** Full kontroll over modeller i et rent 3D-miljø.
- **Formbare sømmer:** Lag avanserte kutt med "Zigzag" eller egendefinerte kurver for å lage puslespill-ledd.
- **Flere deler:** Administrer og kutt flere modeller samtidig i samme scene.
- **Lokal prosessering:** All geometri-beregning skjer lokalt i din nettleser (ingen opplasting til turbid sky).
- **Eksport:** Last ned dine kuttede deler som trykk-klare STL-filer.

## Teknisk Stack
- React + Vite
- Three.js (WebGL)
- react-three-fiber / drei
- three-bvh-csg (Boolean-operasjoner)

## Utvikling
For å kjøre prosjektet lokalt:
```bash
npm install
npm run dev
```

Utviklet med hjelp fra Antigravity / Gemini.
