import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Handshake, KeyRound, Mail, Sparkles } from "lucide-react";
import { contactPage } from "@/content/marketing/sarbato";
import { ContactForm } from "./contact-form";
import styles from "./contact-page.module.css";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contactează Sarbato pentru întrebări despre produs, acces sau colaborări.",
  alternates: { canonical: "/contact" },
};

const pathIcons = [Sparkles, KeyRound, Handshake] as const;

export default function ContactPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="contact-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{contactPage.eyebrow}</p>
          <h1 id="contact-title">{contactPage.title}</h1>
          <p className={styles.lead}>{contactPage.lead}</p>

          <div className={styles.directContact}>
            <span className={styles.directIcon} aria-hidden>
              <Mail />
            </span>
            <div>
              <p>{contactPage.directTitle}</p>
              <a href={`mailto:${contactPage.email}`}>{contactPage.email}</a>
              <span>{contactPage.directLead}</span>
            </div>
          </div>

          <div className={styles.faqLink}>
            <span>{contactPage.faqLabel}</span>
            <Link href="/#intrebari">
              {contactPage.faqLink}
              <ArrowRight aria-hidden />
            </Link>
          </div>
        </div>

        <div className={styles.formShell}>
          <ContactForm
            copy={contactPage.form}
            destination={contactPage.email}
          />
        </div>

        <svg
          className={styles.heroThread}
          viewBox="0 0 1440 220"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="contact-thread" x1="0%" x2="100%">
              <stop offset="0%" stopColor="#3b183f" />
              <stop offset="28%" stopColor="#3b183f" />
              <stop offset="43%" stopColor="#f0b735" />
              <stop offset="57%" stopColor="#f0b735" />
              <stop offset="72%" stopColor="#77a991" />
              <stop offset="100%" stopColor="#77a991" />
            </linearGradient>
          </defs>
          <path d="M0 176H385C452 176 464 70 536 70H906C969 70 979 176 1050 176H1440" />
          <circle cx="536" cy="70" r="5" />
          <circle cx="1050" cy="176" r="5" />
        </svg>
      </section>

      <section className={styles.paths} aria-labelledby="contact-paths-title">
        <header>
          <h2 id="contact-paths-title">{contactPage.pathsTitle}</h2>
          <p>{contactPage.pathsLead}</p>
        </header>

        <div className={styles.pathGrid}>
          {contactPage.paths.map((path, index) => {
            const Icon = pathIcons[index] ?? Sparkles;
            return (
              <article key={path.title}>
                <span className={styles.pathIcon} data-tone={index} aria-hidden>
                  <Icon />
                </span>
                <div>
                  <h3>{path.title}</h3>
                  <p>{path.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
