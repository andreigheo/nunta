import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bus,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ClipboardCheck,
  Columns3,
  Flower2,
  ListChecks,
  Mail,
  MapPinned,
  MessageSquareText,
  Radio,
  SquareCheckBig,
  Store,
  UserRound,
  UsersRound,
  Utensils,
  WalletCards,
} from "lucide-react";
import { primaryCta } from "@/content/marketing/sarbato";
import { ProductHeroThread } from "./product-hero-thread";
import styles from "./product-page.module.css";

export const metadata: Metadata = {
  title: "Produs",
  description:
    "Descoperă cum Sarbato conectează planificarea, invitațiile, RSVP-ul, furnizorii, bugetul și ziua evenimentului.",
  alternates: { canonical: "/produs" },
};

const stages = [
  { label: "Plan", Icon: ListChecks },
  { label: "Invitație", Icon: Mail },
  { label: "RSVP", Icon: UsersRound },
  { label: "Logistică", Icon: ClipboardCheck },
  { label: "Furnizori", Icon: Store },
  { label: "Buget", Icon: WalletCards },
  { label: "Ziua evenimentului", Icon: CalendarDays },
] as const;

const handoffSteps = [
  { label: "Activitate aprobată", Icon: ClipboardCheck, tone: "plum" },
  { label: "Invitație publicată", Icon: Mail, tone: "plum" },
  { label: "RSVP primit", Icon: UsersRound, tone: "sage" },
  { label: "Logistică pregătită", Icon: Store, tone: "sun" },
  { label: "Furnizor confirmat", Icon: Clock3, tone: "mist" },
  { label: "Buget actualizat", Icon: WalletCards, tone: "coral" },
  { label: "Comandă live", Icon: CalendarDays, tone: "sage" },
] as const;

const planRows = [
  ["Stabilește tema și conceptul", "Ioana P.", "12 mai", "Finalizată", "/marketing/operations/ioana.png"],
  ["Trimite invitațiile", "Andrei M.", "15 mai", "În progres", "/marketing/operations/andrei.png"],
  ["Confirmă locația", "Radu T.", "18 mai", "De făcut", "/marketing/operations/radu.png"],
  ["Finalizează meniul", "Elena D.", "20 mai", "De făcut", "/marketing/operations/elena.png"],
  ["Plan logistică și transport", "Vlad M.", "22 mai", "De făcut", "/marketing/operations/vlad.png"],
] as const;

const vendors = [
  ["Bright Vision Foto-Video", "Pachet Gold", "12.800", "Disponibil", "Propunere"],
  ["SoundPro Tehnic", "Pachet Standard", "14.200", "Disponibil", "Angajament"],
  ["GastroPlus Catering", "Pachet Premium", "16.800", "Parțial", "Propunere"],
  ["City Events Transport", "Pachet Complet", "3.500", "Disponibil", "Propunere"],
] as const;

const budgetRows = [
  ["Locație", "36.000 RON", "90%"],
  ["Tehnic", "10.400 RON", "61%"],
  ["Catering", "16.800 RON", "70%"],
  ["Marketing", "6.900 RON", "46%"],
  ["Altele", "3.500 RON", "35%"],
] as const;

const schedule = [
  ["08:00", "Sosire echipă tehnică"],
  ["09:30", "Setup și testare"],
  ["11:00", "Primirea invitaților"],
  ["12:00", "Ceremonie"],
  ["13:00", "Prânz"],
  ["14:30", "Sesiune foto"],
] as const;

const team = [
  ["I", "Ioana Popescu", "Project Manager"],
  ["R", "Radu Toma", "Logistică"],
  ["E", "Elena Dinu", "Catering"],
  ["A", "Andrei M.", "Tehnic"],
] as const;

const liveVendors = [
  ["B", "Bright Vision", "Foto-Video"],
  ["S", "SoundPro", "Tehnic"],
  ["G", "GastroPlus", "Catering"],
  ["C", "City Events", "Transport"],
] as const;

function Status({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "green" | "yellow" | "coral" | "neutral" }) {
  return <span className={styles.status} data-tone={tone}>{children}</span>;
}

function ProductHero() {
  return (
    <section className={styles.hero} aria-labelledby="product-title" data-product-hero>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>Produsul Sarbato</p>
        <h1 id="product-title">
          Tot ce construiești într-o etapă lucrează pentru următoarea.
        </h1>
        <p className={styles.heroLead}>
          Planul, invitațiile, răspunsurile, furnizorii, bugetul și ziua
          evenimentului rămân în același sistem.
        </p>
        <div className={styles.heroActions}>
          <Link className={styles.primaryButton} href={primaryCta.href} data-hero-thread-start>
            {primaryCta.label}
          </Link>
          <a className={styles.secondaryButton} href="#cum-functioneaza">
            Vezi cum funcționează
          </a>
        </div>
      </div>

      <div className={styles.heroSystem} aria-label="Exemplu de flux Sarbato" data-hero-thread-system>
        <div className={styles.systemHeader}>
          <h2>Firul evenimentului</h2>
          <span>Eveniment demonstrativ</span>
        </div>
        <ol className={styles.stageTrack}>
          {stages.map(({ label, Icon }, index) => (
            <li
              key={label}
              data-tone={index < 3 ? "plum" : index < 5 ? "sun" : "sage"}
            >
              <span>
                <Icon aria-hidden strokeWidth={1.8} />
              </span>
              <p>{label}</p>
            </li>
          ))}
        </ol>

        <div className={styles.handoffCards}>
          <article data-hero-thread-card>
            <svg
              className={`${styles.cardConnector} ${styles.activityConnector}`}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path d="M0 100C58 100 19 0 100 0" />
            </svg>
            <span className={`${styles.connectorNode} ${styles.activityStartNode}`} aria-hidden />
            <div className={styles.cardTitle}>
              <CheckCircle2 aria-hidden strokeWidth={1.8} />
              <span>Activitate predată</span>
            </div>
            <h3>Trimiterea invitației la parteneri</h3>
            <p>15 mai, 10:00</p>
            <dl>
              <div><dt>Responsabil</dt><dd>Andrei M.</dd></div>
            </dl>
            <Status tone="green">Predată către Invitații</Status>
          </article>

          <article className={styles.responseCard}>
            <svg
              className={`${styles.cardConnector} ${styles.responseConnector}`}
              viewBox="0 0 100 12"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path d="M0 6H100" />
            </svg>
            <span className={`${styles.connectorNode} ${styles.activityEndNode}`} aria-hidden />
            <span className={`${styles.connectorNode} ${styles.responseStartNode}`} aria-hidden />
            <div className={styles.cardTitle}>
              <Mail aria-hidden strokeWidth={1.8} />
              <span>Răspuns primit</span>
            </div>
            <div className={styles.personRow}>
              <span className={styles.avatar} aria-hidden />
              <strong>Maria Popescu</strong>
              <Status tone="green">A răspuns</Status>
            </div>
            <dl>
              <div><dt>Participă</dt><dd>Da</dd></div>
              <div><dt>Meniu</dt><dd>Pește</dd></div>
              <div><dt>Masă</dt><dd>Masa 7</dd></div>
              <div><dt>Transport</dt><dd>Da</dd></div>
            </dl>
            <span className={styles.mockButton}>Deschide detalii</span>
          </article>

          <article data-hero-budget-card>
            <svg
              className={`${styles.cardConnector} ${styles.budgetConnector}`}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              <defs>
                <linearGradient
                  id="product-budget-thread"
                  x1="100"
                  y1="100"
                  x2="0"
                  y2="0"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0" stopColor="#cfc7d0" />
                  <stop offset="0.48" stopColor="#765b78" />
                  <stop offset="1" stopColor="#4a174d" />
                </linearGradient>
              </defs>
              <path d="M100 100H30C10 100 0 62 0 0" />
            </svg>
            <span className={`${styles.connectorNode} ${styles.responseEndNode}`} aria-hidden />
            <span className={`${styles.connectorNode} ${styles.budgetStartNode}`} aria-hidden />
            <div className={styles.cardTitle}>
              <Clock3 aria-hidden strokeWidth={1.8} />
              <span>Angajament bugetar</span>
            </div>
            <h3>SoundPro Tehnic</h3>
            <p>Sistem audio</p>
            <strong className={styles.bigValue}>12.800 RON</strong>
            <dl>
              <div><dt>Categorie</dt><dd>Tehnic</dd></div>
              <div><dt>Status</dt><dd><Status tone="yellow">Angajament</Status></dd></div>
            </dl>
            <span className={styles.mockButton}>Vezi în buget</span>
          </article>
        </div>
      </div>

      <ProductHeroThread />
    </section>
  );
}

function ConnectedFlow() {
  return (
    <section id="cum-functioneaza" className={styles.connectedFlow} aria-labelledby="flow-title">
      <h2 id="flow-title">Nu sunt șapte instrumente. Este un singur eveniment.</h2>
      <p>Fiecare răspuns păstrează contextul necesar pentru decizia care urmează.</p>
      <ol>
        {handoffSteps.map(({ label, Icon, tone }, index) => (
          <li key={label}>
            <span data-tone={tone}><Icon aria-hidden strokeWidth={1.75} /></span>
            <p>{label.replace(" ", "\n")}</p>
            {index < handoffSteps.length - 1 ? <ArrowRight aria-hidden /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function PlanningChapter() {
  return (
    <section id="planificare" className={styles.chapter} data-chapter="planning" aria-labelledby="planning-title">
      <div className={styles.planPanel}>
        <div className={styles.panelTopline}>
          <div>
            <h3>Planul activităților</h3>
            <div className={styles.tabs}>
              <span className={styles.activeTab}><ListChecks aria-hidden />Listă</span>
              <span><CalendarDays aria-hidden />Calendar</span>
              <span><Columns3 aria-hidden />Kanban</span>
            </div>
          </div>
          <span className={styles.mockControl}>Toate responsabilitățile <ChevronDown aria-hidden /></span>
        </div>
        <div className={styles.planTable} aria-label="Plan demonstrativ">
          <div className={styles.tableHeader}><span>Activitate</span><span>Responsabil</span><span>Termen</span><span>Stare</span></div>
          {planRows.map((row, index) => (
            <div className={styles.tableRow} key={row[0]}>
              <span>{row[0]}</span>
              <span><i className={styles.initial} style={{ backgroundImage: `url(${row[4]})` }} aria-hidden />{row[1]}</span>
              <span>{row[2]}</span>
              <span><Status tone={index === 0 ? "green" : index === 1 ? "yellow" : "neutral"}>{row[3]}</Status></span>
            </div>
          ))}
          <span className={styles.addRow}>+ Activitate nouă</span>
        </div>
      </div>

      <div className={styles.chapterCopy}>
        <h2 id="planning-title">Planul devine sursa comună de lucru.</h2>
        <ul>
          <li><ClipboardCheck aria-hidden /><div><strong>Responsabil clar</strong><p>Fiecare activitate are un proprietar și este predată mai departe.</p></div></li>
          <li><CalendarDays aria-hidden /><div><strong>Termen vizibil</strong><p>Termenele sunt afișate, urmărite și actualizate în timp real.</p></div></li>
          <li><Radio aria-hidden /><div><strong>Dependențe păstrate</strong><p>Fără dubluri. Contextul rămâne atașat activității.</p></div></li>
        </ul>
      </div>
    </section>
  );
}

function InvitationsChapter() {
  return (
    <section id="invitatii" className={styles.chapter} data-chapter="invitations" aria-labelledby="invitations-title">
      <div className={styles.chapterCopy}>
        <h2 id="invitations-title">Invitația aduce răspunsul înapoi în plan.</h2>
        <ul className={styles.coloredList}>
          <li><i data-tone="plum" />Publici invitația.</li>
          <li><i data-tone="sage" />Primești răspunsuri și preferințe.</li>
          <li><i data-tone="coral" />Informația alimentează logistica și bugetul.</li>
        </ul>
      </div>

      <div className={styles.invitationFlow}>
        <div className={styles.phonePreview}>
          <div className={styles.inviteMark}><Flower2 aria-hidden strokeWidth={1.15} /></div>
          <p>Te invităm la<br />evenimentul nostru!</p>
          <span>24 mai 2026<br />București</span>
          <span className={styles.mockButton}>Confirmă participarea</span>
        </div>
        <article className={styles.compactResponse}>
          <div className={styles.cardTitle}><MessageSquareText aria-hidden /><span>Răspuns primit</span></div>
          <div className={styles.personRow}><span className={styles.avatar} aria-hidden /><strong>Maria Popescu</strong></div>
          <Status tone="green">A răspuns</Status>
          <dl>
            <div><dt>Participă</dt><dd>Da</dd></div><div><dt>Meniu</dt><dd>Pește</dd></div><div><dt>Masă</dt><dd>Masa 7</dd></div><div><dt>Transport</dt><dd>Da</dd></div>
          </dl>
          <span className={styles.mockButton}>Vezi detalii</span>
        </article>
        <article className={styles.logisticsCard}>
          <div className={styles.cardTitle}><Radio aria-hidden /><span>Logistică alimentată</span></div>
          <div><Utensils aria-hidden /><p><span>Meniu</span><strong>Pește</strong></p></div>
          <div><MapPinned aria-hidden /><p><span>Masă</span><strong>Masa 7</strong></p></div>
          <div><Bus aria-hidden /><p><span>Transport</span><strong>Da</strong></p></div>
          <span className={styles.invitationBudgetConnector} aria-hidden />
        </article>
      </div>
    </section>
  );
}

function VendorsChapter() {
  return (
    <section id="furnizori" className={styles.chapter} data-chapter="vendors" aria-labelledby="vendors-title">
      <div className={styles.chapterCopy}>
        <h2 id="vendors-title">Compari decizia și vezi impactul ei.</h2>
        <ul className={styles.coloredList}>
          <li><i data-tone="sun" />Compari ofertele pe aceleași criterii.</li>
          <li><i data-tone="sun" />Verifici disponibilitatea și statutul.</li>
          <li><i data-tone="sun" />Observi impactul în buget pe loc.</li>
        </ul>
      </div>

      <div className={styles.commercePanels}>
        <div className={styles.vendorPanel}>
          <div className={styles.panelTopline}><h3>Furnizori</h3><span>Contracte</span></div>
          <div className={styles.vendorTable} tabIndex={0} aria-label="Comparație furnizori, derulează orizontal pentru toate coloanele">
            <div className={styles.vendorHeader}><span>Furnizor</span><span>Pachet</span><span>Preț total</span><span>Disponibilitate</span><span>Statut</span></div>
            {vendors.map((vendor, index) => (
              <div className={styles.vendorRow} key={vendor[0]}>
                {vendor.map((cell, cellIndex) => <span key={cell}>{cellIndex === 3 ? <em>{cell}</em> : cellIndex === 4 ? <Status tone={index === 1 ? "green" : "yellow"}>{cell}</Status> : cell}</span>)}
              </div>
            ))}
          </div>
          <span className={styles.mockButton}>Vezi detalii și contacte</span>
        </div>

        <div className={styles.budgetPanel}>
          <div className={styles.panelTopline}><h3>Buget</h3><span>Vezi raport</span></div>
          <div className={styles.budgetTotals}><p>Total buget<strong>120.000 RON</strong></p><p>Cheltuit<strong>81.600 RON <small>(68%)</small></strong></p></div>
          <div className={styles.budgetProgress}><i /></div>
          <div className={styles.budgetRows}>
            {budgetRows.map((row) => (
              <div key={row[0]}><span>{row[0]}</span><span>{row[1]}</span><i><b style={{ width: row[2] }} /></i><strong>{row[2]}</strong></div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OperationsChapter() {
  return (
    <section id="ziua-evenimentului" className={styles.chapter} data-chapter="operations" aria-labelledby="operations-title">
      <div className={styles.chapterCopy}>
        <h2 id="operations-title">În teren, planul devine comandă.</h2>
        <ul>
          <li><SquareCheckBig aria-hidden /><span>Programul zilei, pas cu pas.</span></li>
          <li><SquareCheckBig aria-hidden /><span>Echipa știe cine face ce și când.</span></li>
          <li><SquareCheckBig aria-hidden /><span>Furnizorii sunt coordonați live.</span></li>
          <li><SquareCheckBig aria-hidden /><span>Alertele te țin înaintea problemelor.</span></li>
        </ul>
      </div>

      <div className={styles.commandPanel}>
        <section><h3>Program</h3>{schedule.map((item, index) => <div className={index === 3 ? styles.nowRow : ""} key={item[0]}><time>{item[0]}</time><span>{item[1]}</span>{index === 3 ? <Status tone="green">Acum</Status> : null}</div>)}</section>
        <section><h3>Echipă</h3>{team.map((item) => <div className={styles.liveRow} key={item[1]}><i>{item[0]}</i><p><strong>{item[1]}</strong><span>{item[2]}</span></p><em>Online</em></div>)}</section>
        <section><h3>Furnizori</h3>{liveVendors.map((item) => <div className={styles.liveRow} key={item[1]}><i>{item[0]}</i><p><strong>{item[1]}</strong><span>{item[2]}</span></p><em>La fața locului</em></div>)}</section>
        <section className={styles.alerts}><h3>Alerte</h3><p><i data-tone="coral" />2 furnizori întârzie<span>Verifică acum</span></p><p><i data-tone="sun" />Nivel stoc băuturi<span>Sub 15%</span></p><p><i data-tone="sage" />Confirmare parcare<span>De la 14:00</span></p></section>
      </div>

      <span className={styles.operationsThread} aria-hidden>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M12.5 0H4C1.8 0 0 3.5 0 9V78C0 92 3 100 7 100H86C94 100 96 93 96 77C96 58 96 44 100 44" />
        </svg>
        <i data-node="entry" />
        <i data-node="handoff" />
      </span>
    </section>
  );
}

function RolesSection() {
  const roles = [
    { icon: UserRound, title: "Organizator", text: "Vedere completă. Decide, aprobă, prioritizează și urmărește impactul.", action: "Controlează", tone: "plum" },
    { icon: UsersRound, title: "Echipă", text: "Primește ce are de făcut, execută și raportează progresul.", action: "Execută", tone: "sage" },
    { icon: UserRound, title: "Invitat", text: "Primește invitația, răspunde și vede doar ce îl privește.", action: "Răspunde", tone: "coral" },
  ] as const;

  return (
    <section className={styles.roles} aria-labelledby="roles-title">
      <h2 id="roles-title">Fiecare persoană vede exact suprafața de care are nevoie.</h2>
      <div>
        {roles.map(({ icon: Icon, title, text, action, tone }, index) => (
          <article key={title} data-tone={tone}>
            <span><Icon aria-hidden /></span>
            <div><h3>{title}</h3><p>{text}</p><strong>{action}</strong></div>
            {index < roles.length - 1 ? <i aria-hidden /> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export default function ProductPage() {
  return (
    <div className={styles.page}>
      <ProductHero />
      <ConnectedFlow />
      <div className={styles.story}>
        <PlanningChapter />
        <InvitationsChapter />
        <VendorsChapter />
        <OperationsChapter />
      </div>
      <RolesSection />
      <section className={styles.finalCta} aria-labelledby="product-cta-title">
        <h2 id="product-cta-title">Creează spațiul evenimentului. Sarbato leagă restul.</h2>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient
              id="product-final-cta-thread"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="100"
              x2="66"
              y2="100"
            >
              <stop offset="0%" stopColor="#b99f8f" />
              <stop offset="18%" stopColor="#b99f8f" />
              <stop offset="42%" stopColor="#a98787" />
              <stop offset="68%" stopColor="#74445f" />
              <stop offset="88%" stopColor="#4a174d" />
              <stop offset="100%" stopColor="#4a174d" />
            </linearGradient>
            <linearGradient
              id="product-final-cta-thread-taper"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="12"
              y2="0"
            >
              <stop offset="0%" stopColor="#000" />
              <stop offset="100%" stopColor="#fff" />
            </linearGradient>
            <mask
              id="product-final-cta-thread-mask"
              maskUnits="userSpaceOnUse"
              x="-2"
              y="-2"
              width="104"
              height="104"
            >
              <rect
                x="-2"
                y="-2"
                width="104"
                height="104"
                fill="url(#product-final-cta-thread-taper)"
              />
            </mask>
          </defs>
          <path
            className={styles.finalCtaThread}
            d="M0 100H66C80 100 82 67 87 33C90 12 96 0 100 0"
            mask="url(#product-final-cta-thread-mask)"
          />
        </svg>
        <i className={styles.finalCtaNode} aria-hidden />
        <div>
          <Link className={styles.primaryButton} href={primaryCta.href}>{primaryCta.label}</Link>
          <Link className={styles.secondaryButton} href="/#abonamente">Vezi prețurile</Link>
        </div>
      </section>
    </div>
  );
}
