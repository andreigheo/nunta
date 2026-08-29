import { faqs } from "@/content/marketing/sarbato";
import styles from "./faq-section.module.css";

export function FaqSection() {
  return (
    <section
      id="intrebari"
      className={styles.section}
      aria-labelledby="faq-title"
      data-testid="faq-section"
    >
      <div className={styles.shell}>
        <header className={styles.intro}>
          <h2 id="faq-title">Întrebări firești. Răspunsuri clare.</h2>
          <p>
            Ce trebuie să știi înainte să muți organizarea evenimentului în
            Sarbato.
          </p>
        </header>

        <div className={styles.list}>
          {faqs.map((item, index) => (
            <details
              key={item.q}
              className={styles.item}
              open={index === 0}
            >
              <summary>
                <span className={styles.question}>{item.q}</span>
                <span className={styles.toggle} aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
