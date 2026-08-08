---
name: Sarbato
description: Control calm și energie vie pentru planificarea, coordonarea și operarea unui eveniment într-un singur sistem.
colors:
  canvas: "#f7f7f3"
  surface: "#ffffff"
  elevated: "#ffffff"
  subtle: "#f1edf2"
  sunken: "#e7e1e9"
  ink: "#19151d"
  ink-muted: "#57515b"
  ink-faint: "#6d6670"
  line: "#ded8df"
  line-strong: "#c9c0cc"
  plum: "#3b183f"
  plum-strong: "#29102d"
  plum-soft: "#e8dce9"
  plum-softer: "#f3ecf4"
  on-plum: "#fff9ff"
  coral: "#f06449"
  coral-strong: "#9d3021"
  coral-soft: "#fde9e5"
  on-coral: "#22110e"
  sage: "#77a991"
  sage-soft: "#e3f0e9"
  success: "#1f6b53"
  success-soft: "#dff1e9"
  warning: "#765000"
  warning-soft: "#fff0bf"
  danger: "#ad3434"
  danger-soft: "#f8e3e3"
  info: "#315f87"
  info-soft: "#e4edf5"
typography:
  display:
    fontFamily: "Afacad Flux, Inter, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 3.4vw, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.06
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Afacad Flux, Inter, system-ui, sans-serif"
    fontSize: "clamp(2rem, 2.4vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  story:
    fontFamily: "Afacad Flux, Inter, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 1.7vw, 1.875rem)"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  lead:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(1.125rem, 1.3vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "0.06em"
  metric:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
rounded:
  control: "8px"
  surface: "14px"
  feature: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section-compact: "56px"
  section-standard: "88px"
  section-major: "120px"
components:
  button-primary:
    backgroundColor: "{colors.plum}"
    textColor: "{colors.on-plum}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.plum-strong}"
    textColor: "{colors.on-plum}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.plum}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
    height: "44px"
  product-surface:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.feature}"
    padding: "24px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "44px"
  status-chip:
    backgroundColor: "{colors.plum-soft}"
    textColor: "{colors.plum-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
---

# Design System: Sarbato

## Overview

**Creative North Star: "Control calm"**

Sarbato trebuie să transmită senzația unei echipe de coordonare care a pus fiecare decizie la locul ei înainte ca presiunea să apară. Interfața este vie, precisă și umană, însă produsul — nu decorul — rămâne centrul fiecărei compoziții.

**O singură identitate, două intensități.** Marketingul și produsul folosesc aceeași paletă Sarbato — prune profunde (`#3b183f`) pentru autoritate, coral (`#f06449`) pentru energie, galben cald (`#f0b735`) pentru celebrare și verde (`#1f6b53`) pentru confirmare, pe neutre curate ușor violetate. Marketingul poate folosi întreaga paletă expresiv; dashboardul rămâne majoritar neutru și rezervă culoarea pentru acțiune, orientare și stare.

Tipografia de identitate este **Afacad Flux**, folosită pentru wordmark și titlurile de sistem. Inter rămâne fontul operațional pentru navigație, controale, formulare, tabele, metadata și cifre. Fraunces este permis numai în conținut creativ controlat de utilizator, precum invitațiile și previzualizările lor.

Elementul semnătură este **firul**: o linie continuă care leagă capitolele poveștii unui singur eveniment (Plan → Invitație → RSVP → Logistică → Furnizori → Buget → Ziua evenimentului) și își schimbă culoarea pe măsură ce informația trece prin etape. Conexiunile arată cum o schimbare utilă circulă prin sistem; nu sunt linii decorative și nu inventează activitate. Ritmul paginii alternează zone editoriale aerisite cu suprafețe autentice, compacte, de produs.

Landing-ul este exclusiv light. Layoutul folosește containerul de maximum 1440px, o împărțire asimetrică în hero la desktop și o coloană semantică pe mobil. Orice animație este o îmbunătățire a unei stări deja vizibile și dispare în `prefers-reduced-motion`.

**Key Characteristics:**

- calm operațional, nu exuberanță festivă;
- produs autentic, nu mockup publicitar;
- ierarhie editorială clară, fără metronom de carduri identice;
- date reale numai când sunt agregate, proaspete și sigure;
- interacțiuni lizibile, tactile și accesibile de la 320px în sus.

## Colors

Paleta combină neutre curate ușor violetate cu plum-ul operațional, coralul folosit rar pentru energie și culori semantice rezervate stărilor reale.

### Primary

- **Plum operațional** este culoarea acțiunilor primare, a stării active și a legăturilor dintre module.
- **Plum profund** oferă contrast pentru hover, titluri pe suprafețe colorate și focusuri puternice.
- **Plum soft** marchează selecția și orientarea fără să domine pagina.

### Secondary

- **Coral viu** semnalează repere editoriale, termene și accente rare; nu concurează cu acțiunea primară.
- **Sage de legătură** susține diagramele și stările neutre din flux.

### Neutral

- **Canvas neutru** este fundalul comun al produsului și al landing-ului.
- **Surface alb** și **Elevated alb** separă produsul prin stratificare tonală.
- **Ink** este textul principal; **Ink muted** este text secundar. **Ink faint** este permis doar pentru metadata scurtă, niciodată pentru paragrafe.
- **Line** și **Line strong** delimitează structura, nu decorează cardurile.

**The Plum Action Rule.** O singură acțiune primară per zonă folosește plum plin; restul acțiunilor rămân tonale sau textuale.

**The Honest Status Rule.** Success, warning, danger și info se folosesc numai pentru o stare reală a sistemului. Coral nu înlocuiește o culoare semantică.

## Typography

**Brand Font:** Afacad Flux, cu Inter fallback  
**Body Font:** Inter, cu system-ui fallback

**Character:** Afacad Flux dă identitatea Sarbato wordmarkului și titlurilor, iar Inter păstrează densitatea și precizia dashboardului. Marketingul și produsul folosesc aceleași roluri tipografice la intensități diferite.

### Hierarchy

- **Display** (600, 40–56px, 1.06): un singur H1, maximum 62ch pentru textul de sprijin și maximum `-0.03em` tracking.
- **Headline** (600, 32–40px, 1.10): titluri de capitole majore, cu text echilibrat.
- **Story** (600, 24–30px, 1.18): narațiunea celor patru module operaționale.
- **Title** (600, 20px, 1.30): titluri compacte de produs și grupuri funcționale.
- **Lead** (400, 18–20px, 1.55): introduceri, maximum 68ch.
- **Body** (400, 16px, 26px): toate paragrafele editoriale. Nu se micșorează pentru a încăpea într-un layout.
- **Label** (600, 12px, 0.06em): metadata rară și statusuri scurte; majusculele nu devin ritmul fiecărei secțiuni.
- **Metric** (600, 28px, 1): procente agregate, cu cifre tabulare.

Dashboardul încorporat poate folosi scara lui compactă, între 11px și 26px, numai în suprafața de produs și numai când rămâne lizibil la dimensiunea afișată. Pe mobil, suprafața se rearanjează; nu se scalează ca o imagine.

**The Two Scales Rule.** Marketingul și produsul au rampe distincte. Nicio dimensiune de miniatură nu devine body copy pe landing.

**The Quiet Headline Rule.** Titlurile rămân sub 56px, trackingul nu trece sub `-0.04em`, iar fiecare nivel este folosit pentru o funcție semantică, nu pentru efect.

## Elevation

Adâncimea este în primul rând tonală. Suprafețele stau plate pe canvas; umbrele apar numai pentru suprafața dominantă de produs, meniuri sau elemente ridicate de interacțiune. O margine și o umbră largă nu sunt combinate decorativ pe același card.

### Shadow Vocabulary

- **Low** (`0 1px 2px rgba(32,33,31,.05)`): separare discretă pentru controale.
- **Medium** (`0 4px 14px -2px rgba(32,33,31,.10), 0 2px 4px -1px rgba(32,33,31,.05)`): suprafața principală de dashboard și elemente temporar ridicate.
- **High** (`0 16px 40px -12px rgba(32,33,31,.20)`): meniuri și overlay-uri, niciodată o grilă întreagă de carduri.

**The Tonal First Rule.** Începe cu diferența dintre canvas, surface și elevated. Adaugă umbră numai dacă ordinea de suprapunere nu este suficient de clară.

## Components

Componentele sunt precise și tactile. Controalele au minimum 44px, focus vizibil și stări exprimate atât prin culoare, cât și prin text sau formă.

### Buttons

- **Shape:** colțuri controlate (8px), nu pill implicit.
- **Primary:** plum cu text on-plum, 44px înălțime și padding orizontal de 20px.
- **Hover / Focus:** plum profund la hover; focus ring de 3px bazat pe plum, cu offset vizibil.
- **Secondary:** suprafață albă, text plum și o margine structurală discretă.
- **Text action:** fără container când acțiunea este terțiară; underline-ul apare la hover și focus.

### Chips

- **Style:** pill este rezervat statusurilor, filtrelor și cohortelor; nu se aplică panourilor.
- **State:** un chip selectat folosește plum soft plus text plum profund; starea nu depinde numai de culoare.

### Cards / Containers

- **Corner Style:** 14px pentru suprafețe standard, 18px numai pentru suprafața dominantă de produs.
- **Background:** surface sau elevated, în funcție de ierarhie.
- **Shadow Strategy:** tonal implicit; medium numai pe dovada centrală de produs.
- **Border:** line pentru structură; nicio dungă laterală colorată.
- **Internal Padding:** 16px pe mobil, 24–32px la desktop.

### Inputs / Fields

- **Style:** surface, text ink, margine line-strong, rază de 8px și înălțime minimă de 44px.
- **Focus:** margine plum și ring vizibil; placeholderul respectă contrastul de text.
- **Error / Disabled:** danger cu mesaj explicit; disabled rămâne lizibil și neinteractiv.

### Navigation

Headerul este calm și compact. Linkul activ sau focalizat folosește plum și un indicator structural. Meniul mobil expune aceleași destinații ca desktopul și se închide după navigare.

### Fluxul viu de date

Cele patru noduri sunt un proces real, deci ordinea lor este explicită. Un singur nod poate fi activ, iar panoul asociat descrie ce se propagă în produs. Mișcarea folosește 180–260ms pentru schimbări de stare și maximum 650ms pentru intrarea orchestrată inițială. Nu există loop automat, parallax sau animație la fiecare secțiune.

## Do's and Don'ts

### Do:

- **Do** reutilizează tokenurile și componentele dashboardului; landing-ul trebuie să pară intrarea în același produs.
- **Do** etichetează clar datele ca agregate, ultima actualizare și orice stare `Cohortă insuficientă`.
- **Do** păstrează maximum patru agregate vizibile simultan și maximum două grile de carduri identice pe întreaga pagină.
- **Do** folosește spațiere diferită pentru proof band, secțiuni standard și capitole majore.
- **Do** oferă o versiune semantică liniară a fluxului pentru mobil, cititoare de ecran și reduced motion.

### Don't:

- **Don't** inventa nume, bugete, date de eveniment, testimoniale, logo-uri sau cifre de utilizare.
- **Don't** afișa prețuri ori planuri până când există o decizie comercială reală.
- **Don't** folosi gradient text, glassmorphism, grile decorative, dungi laterale colorate sau ilustrații SVG schițate.
- **Don't** combina o margine de 1px cu o umbră decorativă largă și nu depăși 18px radius pentru suprafețe.
- **Don't** repeta eyebrow-uri uppercase, carduri icon-heading-text sau animații fade-in identice la fiecare secțiune.
- **Don't** transforma dashboardul într-un screenshot micșorat; rearanjează-i conținutul la fiecare breakpoint.
- **Don't** numi datele `live` când snapshotul lipsește, este invalid sau a depășit pragul de prospețime.
