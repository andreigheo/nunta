import styles from "./hero-assembly-invitation.module.css";

const assemblyProgram = [
  {
    time: "18:00",
    title: "Acces",
    scene: "arrival",
    alt: "Invitați discutând în holul luminat al evenimentului",
  },
  {
    time: "19:00",
    title: "Idei în mișcare",
    scene: "keynote",
    alt: "Discurs pe scena circulară în fața publicului",
  },
  {
    time: "20:30",
    title: "Dinner",
    scene: "dinner",
    alt: "Cina evenimentului la o masă lungă",
  },
  {
    time: "22:00",
    title: "Live performance",
    scene: "performance",
    alt: "Performance live într-o lumină coral",
  },
] as const;

export function HeroAssemblyInvitation() {
  return (
    <article
      className={styles.invitation}
      data-invitation-renderer
      aria-label="Invitație demonstrativă pentru The Assembly 2026"
      tabIndex={-1}
    >
      <section className={styles.cover}>
        <EventScene scene="stage" alt="Scenă circulară înconjurată de public" />
        <div className={styles.coverShade} aria-hidden="true" />

        <div className={styles.coverContent}>
          <h2 aria-label="THE ASSEMBLY / 2026">
            <span>The</span>
            <span>
              Assembly<span aria-hidden="true">/</span>
            </span>
            <span>2026</span>
          </h2>
          <p className={styles.promise}>
            <span>O seară pentru oamenii</span>
            <span>care construiesc ce urmează.</span>
          </p>
        </div>

        <div className={styles.coverDetails}>
          <p>
            16 Oct <i /> București <i /> Acces pe bază de invitație
          </p>
          <p>Forum / Dinner / Live performance</p>
        </div>

        <svg
          className={styles.coverThread}
          viewBox="0 0 420 106"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M-12 22 C62 96 142 24 217 63 C285 98 328 67 356 47 C380 29 401 32 403 50 C405 68 384 74 375 59 C365 42 390 30 432 70" />
        </svg>
      </section>

      <section className={styles.program}>
        <h3>Programul serii</h3>
        <ol>
          {assemblyProgram.map((item) => (
            <li key={item.time}>
              <div className={styles.programLabel}>
                <p>
                  <strong>{item.time}</strong>
                  <span aria-hidden="true">·</span>
                  <span>{item.title}</span>
                </p>
                <i aria-hidden="true" />
              </div>
              <EventScene scene={item.scene} alt={item.alt} />
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.rsvp}>
        <EventScene
          scene="venue"
          alt="Coridorul arhitectural al evenimentului, luminat în coral"
        />
        <div className={styles.rsvpShade} aria-hidden="true" />
        <svg
          className={styles.rsvpThread}
          viewBox="0 0 170 520"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M102 -18 C7 83 74 169 112 218 C149 266 105 315 72 294 C39 273 59 241 90 249 C131 259 149 366 98 420 C75 445 61 478 72 542" />
        </svg>

        <div className={styles.rsvpContent}>
          <h3>Locul tău este rezervat</h3>
          <p>Confirmă prezența pentru a primi toate detaliile serii.</p>
          <button type="button" disabled>
            Confirmă participarea
          </button>
          <small>
            Concept demonstrativ <span>Sarbato</span>
          </small>
        </div>
      </section>
    </article>
  );
}

function EventScene({
  scene,
  alt,
}: {
  scene:
    | "stage"
    | "arrival"
    | "keynote"
    | "dinner"
    | "performance"
    | "venue";
  alt: string;
}) {
  return (
    <figure className={`${styles.scene} ${styles[`scene_${scene}`]}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/invitation-art/the-assembly-scenes-v1.png"
        alt={alt}
        draggable={false}
        decoding="async"
      />
    </figure>
  );
}
