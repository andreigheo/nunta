import Link from "next/link";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { pricing } from "@/content/marketing/sarbato";
import styles from "./pricing-section.module.css";

export function PricingSection() {
  return (
    <section
      id="abonamente"
      className={styles.section}
      aria-labelledby="pricing-title"
      data-testid="pricing-section"
    >
      <div className={styles.intro}>
        <h2 id="pricing-title">{pricing.title}</h2>
        <div className={styles.introCopy}>
          <p>{pricing.lead}</p>
          <p className={styles.boundary}>
            <LockKeyhole aria-hidden />
            <span>{pricing.boundary}</span>
          </p>
        </div>
      </div>

      <div className={styles.plans} role="list" aria-label="Planuri Sarbato">
        {pricing.plans.map((plan) => (
          <article
            key={plan.name}
            className={styles.plan}
            data-featured={plan.featured}
            role="listitem"
          >
            <div className={styles.planHeader}>
              <h3>{plan.name}</h3>
              <span className={styles.status}>{plan.status}</span>
            </div>

            <div className={styles.priceLine}>
              <p className={styles.price}>{plan.price}</p>
              <p className={styles.cadence}>{plan.cadence}</p>
            </div>

            <p className={styles.description}>{plan.description}</p>

            <dl
              className={styles.highlights}
              aria-label={`Limite incluse în planul ${plan.name}`}
            >
              {plan.highlights.map((highlight) => (
                <div key={highlight.label}>
                  <dd>{highlight.value}</dd>
                  <dt>{highlight.label}</dt>
                </div>
              ))}
            </dl>

            <p className={styles.includesTitle}>Ce primești</p>

            <ul className={styles.features}>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <span className={styles.check}>
                    <Check strokeWidth={2.5} aria-hidden />
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Link
              className={styles.planAction}
              href={plan.cta.href}
              data-analytics-event="select_plan"
              data-analytics-plan={plan.name}
              data-analytics-price={plan.price}
              data-analytics-destination={plan.cta.href}
            >
              <span>{plan.cta.label}</span>
              <ArrowRight aria-hidden />
            </Link>
          </article>
        ))}
      </div>

      <div className={styles.afterword}>
        <p>
          <Check aria-hidden />
          <span>{pricing.checkoutNote}</span>
        </p>
        <a href="#intrebari">
          <span>Vezi întrebările frecvente</span>
          <ArrowRight aria-hidden />
        </a>
      </div>
    </section>
  );
}
