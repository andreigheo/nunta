import { useId } from "react";

/** Authored centre-line Bézier drawings. No raster images, masks or auto-traced outlines. */
export function AboutPerson({
  role,
}: {
  role: "organizer" | "team" | "supplier" | "guest";
}) {
  if (role === "organizer")
    return (
      <g>
        <path d="M 44 27 C 42 13 51 3 63 3 C 77 3 87 13 86 27 C 86 45 80 60 67 61 C 55 61 46 48 44 34 Z" />
        <path d="M 46 24 C 53 10 61 14 71 18 C 77 20 82 19 85 17" />
        <path d="M 48 48 L 48 61 C 22 64 9 86 8 113 C 7 122 8 131 10 136 M 77 58 C 97 62 108 73 116 92 C 124 110 125 119 120 122 C 114 125 104 120 98 117 C 93 114 95 101 90 91 C 83 74 77 83 78 96 C 78 104 82 113 78 116 C 64 119 51 123 43 130 C 35 136 51 136 65 138 L 117 145 C 128 147 134 140 131 135 C 128 130 117 127 107 125" />
        <path d="M 19 149 C 32 159 58 158 85 160 C 112 162 125 162 140 159" />
      </g>
    );
  if (role === "team")
    return (
      <g>
        <path d="M 37 37 C 36 23 42 15 54 15 C 68 15 76 24 73 39 C 72 53 67 63 57 63 C 46 63 39 53 37 37 Z M 107 24 C 106 10 113 2 124 2 C 137 2 144 11 142 27 C 141 40 136 49 126 49 C 115 49 109 38 107 24 Z M 177 32 C 175 17 181 9 194 9 C 207 9 214 17 212 33 C 212 47 206 59 196 59 C 183 59 178 46 177 32 Z" />
        <path d="M 46 60 L 44 65 C 17 70 7 89 10 116 C 11 139 29 161 53 169 C 65 173 80 176 82 167 C 84 160 87 146 98 147 C 109 148 111 155 102 160 C 91 167 73 155 57 150 C 42 145 42 130 43 110" />
        <path d="M 67 61 C 86 67 92 80 90 96 C 89 119 77 112 81 96 C 84 85 93 64 102 58 L 116 51 L 117 44 M 135 46 L 137 52 C 163 57 170 76 168 101 L 166 136 C 165 160 144 180 116 174 C 106 172 96 169 83 161" />
        <path d="M 100 111 C 92 112 94 88 99 84 C 105 80 103 94 100 99 C 108 107 107 112 100 111" />
        <path d="M 185 56 L 183 62 C 164 68 155 83 155 107 C 154 124 158 129 165 129 C 174 129 169 116 159 114 C 144 112 137 120 145 128 C 151 134 166 127 166 142 C 166 153 151 153 148 144 C 145 133 154 132 171 137 C 185 138 204 131 208 125 C 212 121 210 103 207 104 C 201 104 208 121 202 127" />
        <path d="M 204 56 L 206 62 C 235 66 246 86 244 115 C 242 147 225 165 203 167 C 185 169 160 170 167 153" />
      </g>
    );
  if (role === "supplier")
    return (
      <g>
        <path d="M 42 29 C 42 11 53 2 66 2 C 82 1 91 11 93 24 M 44 34 C 44 22 57 22 70 29 C 80 34 98 34 106 31 C 114 28 91 22 81 25 C 70 29 68 33 94 34 L 92 54 C 89 70 80 79 66 72 M 46 40 C 38 41 38 51 45 56 L 43 68 M 46 68 C 51 75 57 79 64 80" />
        <path d="M 39 72 C 12 79 6 106 7 133 C 7 157 8 173 19 185 M 70 83 C 89 96 93 113 93 132 C 91 147 84 147 84 131 C 83 114 91 114 93 132 L 100 141 M 66 180 C 54 166 64 176 68 179 C 81 185 92 176 107 165 C 120 157 127 148 119 142 C 114 137 111 139 105 144 L 99 149 M 119 144 C 124 129 135 130 137 143 C 138 149 133 151 129 153" />
        <path d="M 97 139 L 121 96 L 154 97 L 139 134 M 100 139 L 117 136 M 19 185 C 27 191 44 195 61 193" />
      </g>
    );
  return (
    <g>
      <path d="M 34 28 C 29 12 40 3 56 3 C 70 2 81 13 81 28 C 80 34 88 41 82 45 L 75 50 M 33 20 C 41 23 46 26 56 24 C 67 22 69 35 73 33 C 77 30 80 33 79 40 M 33 23 C 32 40 34 61 49 66 C 62 70 69 61 74 52 M 53 66 L 54 73 M 72 59 L 75 72" />
      <path d="M 49 73 C 36 75 28 84 26 97 M 76 72 C 102 77 111 96 111 121 C 112 133 110 143 104 153 M 45 104 C 47 121 60 139 76 153 C 80 158 87 161 92 161" />
      <path d="M 5 105 L 2 99 L 35 99 L 43 115 M 6 111 L 0 116 L 11 141 L 43 143 L 49 135 M 42 117 C 29 110 22 116 29 126 C 33 132 41 134 50 134 C 58 133 59 126 52 122 C 49 118 47 118 42 117" />
    </g>
  );
}

export function AboutCalendar({ checked = false }: { checked?: boolean }) {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="10" width="48" height="47" rx="5" />
      <path d="M 4 23 H 52 M 16 3 V 16 M 40 3 V 16" />
      {checked ? (
        <>
          <path d="m16 37 7 7 15-16" />
          <circle cx="46" cy="52" r="8" fill="var(--about-paper, #fbfaf8)" />
          <path d="m42 52 3 3 4-5" />
        </>
      ) : (
        <path
          d="m28 31 3.6 7.4 8.2 1.2-5.9 5.8 1.4 8.1-7.3-3.8-7.3 3.8 1.4-8.1-5.9-5.8 8.2-1.2Z"
          transform="translate(0 -2)"
        />
      )}
    </g>
  );
}

export function AboutHeroArtwork() {
  const id = useId();
  return (
    <svg
      viewBox="0 0 1024 780"
      role="img"
      aria-labelledby={`${id}-title`}
      data-about-art="hero"
    >
      <title id={`${id}-title`}>
        Organizatorul, echipa, furnizorul și invitatul, conectați în jurul
        aceluiași eveniment.
      </title>
      <defs>
        <linearGradient id={`${id}-right`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="44%" stopColor="var(--about-gold)" />
          <stop offset="86%" stopColor="var(--about-green)" />
        </linearGradient>
        <linearGradient id={`${id}-lens`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="26%" stopColor="var(--about-coral)" />
          <stop offset="47%" stopColor="var(--about-green)" />
        </linearGradient>
      </defs>
      <g
        fill="none"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          stroke="var(--about-plum)"
          d="M 294 290 C 352 280 400 226 482 250 C 363 277 353 356 369 439 C 384 523 426 580 482 615"
        />
        <path
          stroke="var(--about-plum)"
          d="M 173 280 C 105 282 80 323 81 377 C 81 435 97 481 130 497"
        />
        <path
          stroke="var(--about-coral)"
          d="M 130 497 C 154 510 177 499 190 482"
        />
        <path
          stroke={`url(#${id}-right)`}
          d="M 482 250 C 565 220 619 275 698 307 C 759 339 807 291 876 294 C 956 285 981 345 974 428 C 967 542 907 630 820 637 C 759 646 729 624 675 632 C 602 640 549 657 482 615"
        />
        <path
          stroke={`url(#${id}-lens)`}
          d="M 482 250 C 564 273 599 340 597 421 C 596 512 550 577 482 615"
        />
        <path
          stroke="var(--about-coral)"
          d="M 0 676 C 7 615 77 612 164 634 C 231 652 258 633 319 640 C 384 647 441 634 482 615"
        />
        <g transform="translate(154 131)" stroke="var(--about-plum)">
          <AboutPerson role="organizer" />
        </g>
        <g transform="translate(608 142)" stroke="var(--about-gold)">
          <AboutPerson role="team" />
        </g>
        <g transform="translate(144 452)" stroke="var(--about-coral)">
          <AboutPerson role="supplier" />
        </g>
        <g transform="translate(675 460)" stroke="var(--about-green)">
          <AboutPerson role="guest" />
        </g>
      </g>
      <g className="about-art-label" textAnchor="middle">
        <text x="218" y="103" fill="var(--about-plum)">
          Organizator
        </text>
        <text x="733" y="103" fill="var(--about-gold-ink)">
          Echipă
        </text>
        <text x="217" y="707" fill="var(--about-coral-ink)">
          Furnizor
        </text>
        <text x="732" y="707" fill="var(--about-green-ink)">
          Invitat
        </text>
      </g>
      <g transform="translate(441 331) scale(1.55)" color="var(--about-plum)">
        <AboutCalendar />
      </g>
      <text
        className="about-art-label"
        textAnchor="middle"
        fill="var(--about-plum)"
        x="484"
        y="469"
      >
        <tspan x="484">Evenimentul</tspan>
        <tspan x="484" dy="33">
          nostru
        </tspan>
      </text>
    </svg>
  );
}

export function AboutRolePortrait({
  role,
}: {
  role: "organizer" | "team" | "supplier" | "guest";
}) {
  const box = {
    organizer: "0 0 150 165",
    team: "0 0 255 180",
    supplier: "0 0 160 198",
    guest: "0 0 120 170",
  }[role];
  return (
    <svg
      viewBox={box}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <AboutPerson role={role} />
    </svg>
  );
}

export function AboutBeliefArtwork() {
  return (
    <svg
      viewBox="0 0 640 220"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M 131 67 C 99 21 37 41 29 96 C 21 147 70 181 125 164 C 180 146 161 78 119 59 C 60 34 13 86 14 126 C 16 169 90 171 124 130 C 156 89 113 36 78 61 C 51 81 55 149 89 180 C 116 205 150 177 120 157 C 94 141 73 172 91 181 C 122 197 129 146 120 118 C 111 87 132 63 150 86 C 177 121 156 157 128 151 C 93 141 69 102 88 78 M 128 151 C 169 172 191 149 215 137 C 242 125 275 129 304 129 H 326" />
      <path d="M 44 91 C 43 74 61 69 66 84 C 71 97 65 108 56 105 C 49 103 46 97 44 91 Z M 44 84 C 52 77 60 91 67 84 M 46 109 C 34 120 34 139 40 148 M 65 108 C 81 115 79 137 71 145 M 113 84 C 117 71 132 70 137 82 L 142 94 L 136 98 C 132 111 119 106 115 99 M 128 107 C 123 121 143 132 141 148 M 104 109 C 88 121 93 140 102 150" />
      <path d="M 337 90 C 336 76 342 68 351 69 C 362 70 365 80 362 91 C 359 104 340 104 337 90 Z M 378 81 C 377 66 384 58 394 59 C 405 60 408 71 405 83 C 402 96 382 96 378 81 Z M 423 91 C 421 77 429 69 438 71 C 449 72 452 82 448 94 C 444 106 426 104 423 91 Z" />
      <path d="M 326 129 C 326 112 331 103 344 102 C 357 101 370 115 370 125 C 370 138 361 132 366 119 C 371 104 378 97 389 97 C 403 96 419 111 420 126 C 421 137 412 135 414 124 C 417 110 425 105 437 105 C 455 105 459 117 459 129 H 640 M 393 45 C 370 26 382 12 393 25 C 404 9 418 28 393 45 M 355 57 l-9-8 M 370 24 l-4-11 M 416 23 l5-9 M 432 53 l9-8" />
    </svg>
  );
}
