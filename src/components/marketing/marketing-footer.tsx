import Link from "next/link";
import { ArrowRight, ArrowUp } from "lucide-react";
import { footer } from "@/content/marketing/sarbato";
import { BrandMark } from "./brand-mark";
import { CookieSettingsButton } from "./cookie-settings-button";
import styles from "./marketing-footer.module.css";

export function MarketingFooter() {
  return (
    <footer className={styles.footer} aria-labelledby="footer-title">
      <div className={styles.colorRail} aria-hidden />
      <div className={styles.shell}>
        <div className={styles.mainGrid}>
          <div className={styles.brandColumn}>
            <BrandMark inverse />
            <h2 id="footer-title">{footer.title}</h2>
            <p className={styles.tagline}>{footer.tagline}</p>
            <Link className={styles.primaryAction} href={footer.action.href}>
              {footer.action.label}
              <ArrowRight aria-hidden />
            </Link>
            <p className={styles.note}>{footer.note}</p>
          </div>

          <nav
            className={styles.linkColumns}
            aria-label="Navigație subsol"
          >
            {footer.columns.map((column) => (
              <div className={styles.linkColumn} key={column.title}>
                <h3>{column.title}</h3>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className={styles.bottomBar}>
          <p>© 2026 Sarbato. Toate drepturile rezervate.</p>
          <nav className={styles.legalLinks} aria-label="Informații juridice">
            {footer.legal.map((link) => (
              <Link href={link.href} key={link.label}>
                {link.label}
              </Link>
            ))}
            <CookieSettingsButton className={styles.cookieSettingsButton} />
          </nav>
          <a className={styles.backToTop} href="#continut">
            Sus
            <ArrowUp aria-hidden />
          </a>
        </div>
      </div>
    </footer>
  );
}
