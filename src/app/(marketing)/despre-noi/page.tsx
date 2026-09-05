import type { Metadata } from "next";
import { Eye, SlidersHorizontal, UsersRound } from "lucide-react";
import { aboutPage as copy } from "@/content/marketing/about";
import { primaryCta, secondaryCta } from "@/content/marketing/sarbato";
import { CtaLink } from "@/components/marketing/section";
import {
  AboutBeliefArtwork,
  AboutCalendar,
  AboutHeroArtwork,
  AboutRolePortrait,
} from "@/components/marketing/about-line-art";
import styles from "./about-page.module.css";

export const metadata: Metadata = {
  title: "Despre noi",
  description: copy.description,
  alternates: { canonical: "/despre-noi" },
  openGraph: {
    title: "Despre Sarbato. Oamenii, în centrul evenimentului.",
    description: copy.description,
    url: "/despre-noi",
  },
};

function Actions() {
  return (
    <div className={styles.actions}>
      <CtaLink cta={primaryCta} variant="primary" />
      <CtaLink cta={secondaryCta} variant="outline" />
    </div>
  );
}

const promiseIcons = [Eye, UsersRound, SlidersHorizontal];

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="about-title">
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <h1 id="about-title">{copy.title}</h1>
            <p>{copy.description}</p>
            <Actions />
          </div>
          <div className={styles.heroArtwork}>
            <AboutHeroArtwork />
          </div>
        </div>
      </section>

      <section className={styles.people} aria-labelledby="about-people-title">
        <header className={styles.sectionIntro}>
          <h2 id="about-people-title">{copy.peopleTitle}</h2>
          <p>{copy.peopleLead}</p>
        </header>
        <div className={styles.peopleFlow}>
          <svg
            className={styles.peopleThread}
            viewBox="0 0 1200 340"
            preserveAspectRatio="none"
            fill="none"
            strokeWidth="1.15"
            aria-hidden="true"
          >
            <path
              stroke="var(--about-plum)"
              d="M 4 153 C 9 107 63 112 92 112 H 292"
            />
            <path
              stroke="var(--about-gold)"
              d="M 292 112 C 333 112 358 109 381 112 C 403 118 402 112 394 108 M 487 107 C 507 115 558 112 585 112"
            />
            <path
              stroke="var(--about-coral)"
              d="M 585 112 C 626 120 650 100 685 108 C 731 125 766 96 799 109 C 824 114 842 110 869 112"
            />
            <path
              stroke="var(--about-green)"
              d="M 869 112 C 933 115 979 108 1023 112 C 1098 105 1190 92 1190 208 C 1190 277 1170 296 1113 296 H 99 C 73 296 70 278 70 255"
            />
            <path
              stroke="var(--about-plum)"
              opacity=".4"
              d="M 70 255 C 70 278 73 296 99 296 H 1022 C 1055 296 1059 281 1059 255"
            />
            <circle
              cx="292"
              cy="112"
              r="3.4"
              stroke="var(--about-plum)"
              fill="var(--about-paper)"
            />
            <circle
              cx="585"
              cy="112"
              r="3.4"
              stroke="var(--about-plum)"
              fill="var(--about-paper)"
            />
            <circle
              cx="869"
              cy="112"
              r="3.4"
              stroke="var(--about-coral)"
              fill="var(--about-paper)"
            />
          </svg>
          <div className={styles.roles}>
            {copy.roles.map((role) => (
              <article
                key={role.key}
                className={styles.role}
                data-role={role.key}
              >
                <div className={styles.portrait}>
                  <AboutRolePortrait role={role.key} />
                </div>
                <h3>{role.label}</h3>
                <p>{role.description}</p>
              </article>
            ))}
          </div>
          <div className={styles.commonPlan}>
            <svg
              viewBox="0 0 100 98"
              aria-hidden="true"
              fill="none"
              color="var(--about-green)"
            >
              <path
                d="M 74 8 C 59-1 27-1 15 10 C 2 20 4 44 5 60 C 6 86 17 91 48 92 C 77 93 94 83 94 60 C 94 47 93 33 89 23"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <g transform="translate(24 20) scale(.86)">
                <AboutCalendar checked />
              </g>
            </svg>
            <h3>{copy.planTitle}</h3>
            <p>{copy.planLead}</p>
          </div>
        </div>
      </section>

      <section
        className={styles.promises}
        aria-labelledby="about-promises-title"
      >
        <h2 id="about-promises-title">{copy.promiseTitle}</h2>
        <div className={styles.promiseFlow}>
          <svg
            className={styles.promiseThread}
            viewBox="0 0 1200 250"
            fill="none"
            preserveAspectRatio="none"
            strokeWidth="1.1"
            aria-hidden="true"
          >
            <path
              stroke="var(--about-plum)"
              d="M -50 22 C -10 22 -8 43 27 43 H 329 C 377 43 373 82 373 127 V 178 C 373 217 391 228 424 228 H 633 C 659 228 671 215 671 201"
            />
            <path
              stroke="var(--about-gold)"
              d="M 458 43 C 458 13 474 10 496 10 H 715 C 776 10 769 53 769 91 V 173 C 769 219 785 228 818 228"
            />
            <path
              stroke="var(--about-green)"
              d="M 861 43 C 861 11 882 29 899 32 H 1014 C 1070 32 1091 50 1091 93 C 1091 121 1107 146 1154 146 H 1250"
            />
            <circle cx="61" cy="43" r="3" fill="var(--about-plum)" />
            <circle cx="1148" cy="146" r="3" fill="var(--about-green)" />
          </svg>
          <div className={styles.promiseGrid}>
            {copy.promises.map((promise, index) => {
              const Icon = promiseIcons[index];
              return (
                <article
                  key={promise.title}
                  className={styles.promise}
                  data-tone={index}
                >
                  <div className={styles.promiseIcon}>
                    <Icon aria-hidden="true" strokeWidth={1.2} />
                  </div>
                  <h3>{promise.title}</h3>
                  <p>{promise.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.belief} aria-labelledby="about-belief-title">
        <div className={styles.beliefInner}>
          <div>
            <h2 id="about-belief-title">{copy.beliefTitle}</h2>
            <p>{copy.beliefLead}</p>
          </div>
          <div className={styles.beliefArtwork}>
            <AboutBeliefArtwork />
          </div>
        </div>
      </section>

      <section className={styles.events} aria-labelledby="about-events-title">
        <h2 id="about-events-title">{copy.eventsTitle}</h2>
        <svg
          className={styles.eventsThread}
          viewBox="0 0 1200 60"
          preserveAspectRatio="none"
          fill="none"
          stroke="var(--about-plum)"
          strokeWidth="1.1"
          aria-hidden="true"
        >
          <path d="M -20 17 C 25 17 33 17 51 28 C 62 35 73 37 94 37 M 1106 37 C 1127 37 1138 35 1149 28 C 1167 17 1175 17 1220 17" />
          <circle cx="94" cy="37" r="2.3" fill="var(--about-plum)" />
          <circle cx="1106" cy="37" r="2.3" fill="var(--about-plum)" />
        </svg>
        <ul>
          {copy.events.map((event) => (
            <li key={event}>{event}</li>
          ))}
        </ul>
      </section>

      <section className={styles.finalCta} aria-labelledby="about-final-title">
        <svg
          className={styles.finalThread}
          viewBox="0 0 100 60"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M -10 58 C 20 58 40 13 94 13"
            stroke="var(--about-plum)"
            strokeWidth="1.2"
          />
          <circle
            cx="94"
            cy="13"
            r="3.2"
            stroke="var(--about-plum)"
            fill="var(--about-paper)"
            strokeWidth="1.2"
          />
        </svg>
        <h2 id="about-final-title">
          {copy.finalTitle.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h2>
        <Actions />
      </section>
    </div>
  );
}
