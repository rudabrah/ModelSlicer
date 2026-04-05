# Changelog - ModelSlicer 3D

## [v0.8.0] - 2026-04-05
### Lagt til
- **Multi-Tool Cutting:** Arkitektur for å håndtere flere kutteverktøy (bokser/snitt) samtidig i scenen.
- **Snap to Face (🎯):** Logikk for å automatisk justere kuttebokser etter modellens overflate ved hjelp av raycasting.
- **Fokus-loop (T):** Forbedret system for å bytte kontroll-fokus mellom Boks, Modell og Snitt-redigering.
- **Finjustering:** Piltaster (posisjon) og Shift+Piltaster (rotasjon) for piksell-nøyaktig plassering av verktøy.
- **Utvidet Sidepanel:** Dynamisk UI som viser kontroller og lar brukeren bytte mellom "Standard Boks" og "Tilpasset Snitt" per verktøy.

### Endret
- **Refaktorert State Management:** Flyttet fra entall `boxRef` til et dynamisk `toolRefs` og `cuttingTools` array for å støtte multi-tool operasjoner.
- **Keyboard Handling:** Løst problemer med "stale closures" i React ved bruk av `useRef` for aktiv tilstand i event-listeners.
- **App UI:** Oppdatert sidepanelet for bedre lesbarhet og tydeligere instruksjoner.

### Fjernet
- **Hollow Model (Shelling):** Funksjonen ble fjernet da den var redundant (slicere håndterer dette bedre) og skapte stabilitetsproblemer på svært store modeller.
- **Midlertidig Debugging:** Fjernet "Hent Test-modell"-knappen før produksjonsklar versjon.

## [v0.7.0] - Tidligere versjon
- Grunnleggende slicing-funksjonalitet.
- Enkel boks-manipulasjon.
- STL/3MF import.
