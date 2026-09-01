import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarCheck2,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Download,
  Ellipsis,
  Headphones,
  HeartPulse,
  Home,
  Columns3,
  LayoutDashboard,
  List,
  Mail,
  MessagesSquare,
  RadioTower,
  Search,
  Settings,
  ShoppingCart,
  SquareCheckBig,
  Star,
  Store,
  Upload,
  UserRoundPlus,
  UsersRound,
  WalletMinimal,
} from "lucide-react";
import {
  assuranceItems,
  primaryCta,
  productFirstControlRoom as copy,
  secondaryCta,
  serviceMarquee,
} from "@/content/marketing/sarbato";
import {
  hasPublishablePublicProof,
  type MarketingProductProof,
} from "@/lib/marketing/product-proof-normalizer";
import { HeroThread } from "./hero-thread";
import { HeroShowcaseCycle } from "./hero-showcase-cycle";
import { FaqSection } from "./faq-section";
import { PricingSection } from "./pricing-section";
import { StoryThreads } from "./story-threads";
import styles from "./product-first-control-room.module.css";

const stageIcons = [
  LayoutDashboard,
  UserRoundPlus,
  CheckCheck,
  Headphones,
  Building2,
  WalletMinimal,
  CalendarCheck2,
] as const;

const railIcons = [
  Home,
  CalendarDays,
  UsersRound,
  SquareCheckBig,
  MessagesSquare,
  CreditCard,
  ChartNoAxesColumnIncreasing,
  Settings,
] as const;

const metricIcons = {
  rsvp: CheckCircle2,
  budget: WalletMinimal,
  activities: HeartPulse,
  suppliers: Store,
} as const;

const chapterIcons = {
  planning: CalendarDays,
  guests: UsersRound,
  commerce: ShoppingCart,
  operations: RadioTower,
} as const;

const toneClass = {
  plum: styles.tonePlum,
  sage: styles.toneSage,
  sun: styles.toneSun,
  coral: styles.toneCoral,
  ink: styles.toneInk,
} as const;

export function ProductFirstControlRoom({
  proof,
}: {
  proof: MarketingProductProof;
}) {
  return (
    <div className={styles.page} data-concept="product-first-control-room-v1">
      <section
        className={styles.hero}
        data-hero-thread-space
        aria-labelledby="control-room-title"
      >
        <div className={styles.heroCopy}>
          <p className={styles.category}>{copy.category}</p>
          <h1 id="control-room-title" className={styles.heroTitle}>
            {copy.titleLines.map((line, index) => (
              <span key={line}>
                {index > 0 ? " " : null}
                {line}
              </span>
            ))}
          </h1>
          <p className={styles.heroLead}>{copy.lead}</p>
          <div className={styles.heroActions}>
            <Link
              className={styles.primaryButton}
              href={primaryCta.href}
              data-hero-thread-start
            >
              {primaryCta.label}
            </Link>
            <Link className={styles.secondaryButton} href={secondaryCta.href}>
              {secondaryCta.label}
            </Link>
          </div>
        </div>
        <HeroControlRoom proof={proof} />
        <HeroThread />
      </section>

      <AssuranceStrip />
      <ServiceMarquee />

      <section
        id="solutii"
        className={styles.storyStack}
        aria-labelledby="solutions-title"
      >
        <StoryThreads />
        <header className={styles.storyIntro}>
          <h2 id="solutions-title">{copy.solutionsIntro.title}</h2>
          <p>{copy.solutionsIntro.lead}</p>
        </header>
        <StorySection
          id={copy.chapters.planning.id}
          title={copy.chapters.planning.title}
          lead={copy.chapters.planning.lead}
          link={copy.chapters.planning.link}
          href="/create-account"
          icon={chapterIcons.planning}
          tone="plum"
        >
          <PlanningSurface />
        </StorySection>

        <StorySection
          id={copy.chapters.guests.id}
          title={copy.chapters.guests.title}
          lead={copy.chapters.guests.lead}
          link={copy.chapters.guests.link}
          href="/create-account"
          icon={chapterIcons.guests}
          tone="sage"
        >
          <GuestsSurface />
        </StorySection>

        <StorySection
          id={copy.chapters.commerce.id}
          title={copy.chapters.commerce.title}
          lead={copy.chapters.commerce.lead}
          link={copy.chapters.commerce.link}
          href="/create-account"
          icon={chapterIcons.commerce}
          tone="sun"
          layout="reverse"
        >
          <CommerceSurface />
        </StorySection>

        <StorySection
          id={copy.chapters.operations.id}
          title={copy.chapters.operations.title}
          lead={copy.chapters.operations.lead}
          link={copy.chapters.operations.link}
          href="/create-account"
          icon={chapterIcons.operations}
          tone="sage"
          layout="reverse"
          last
        >
          <OperationsSurface />
        </StorySection>
      </section>

      <PricingSection />
      <FaqSection />

      <section id="despre" className={styles.finalCta} aria-labelledby="control-room-close">
        <h2 id="control-room-close">{copy.close.title}</h2>
        <div className={styles.finalActions}>
          <span className={styles.finalThread} aria-hidden>
            <svg
              aria-hidden
              focusable="false"
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
              <defs>
                <linearGradient id="final-thread-stroke" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="var(--final-border)" />
                  <stop offset="0.22" stopColor="var(--plum)" />
                </linearGradient>
              </defs>
              <path
                d="M 0 100 H 44 C 61 100 68 88 68 62 C 68 22 77 0 94 0 H 100"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <i />
          </span>
          <Link className={styles.primaryButton} href={primaryCta.href}>
            {primaryCta.label}
          </Link>
          <Link className={styles.secondaryButton} href={secondaryCta.href}>
            {secondaryCta.label}
          </Link>
        </div>
      </section>
    </div>
  );
}

function AssuranceStrip() {
  const assuranceIcons = [
    <Image
      key="open-gate"
      src="/marketing/signature/open-gate.png"
      alt=""
      width={120}
      height={80}
      unoptimized
    />,
    <Image
      key="clear-view"
      src="/marketing/signature/clear-view.png"
      alt=""
      width={164}
      height={80}
      unoptimized
    />,
    <Image
      key="open-loop"
      src="/marketing/signature/open-loop.png"
      alt=""
      width={110}
      height={80}
      unoptimized
    />,
  ] as const;

  return (
    <section
      id="capabilitati"
      className={styles.assuranceStrip}
      aria-labelledby="assurance-title"
      data-testid="assurance-strip"
    >
      <div className={styles.assuranceSignature}>
        <SignatureKnot />
        <h2 id="assurance-title">
          Începe în{" "}
          <br />
          ritmul tău.
        </h2>
      </div>
      <ul
        className={styles.assuranceList}
        aria-label="De ce poți începe în ritmul tău"
      >
        {assuranceItems.map((item, index) => {
          return (
            <li
              key={item.title}
              className={styles.assuranceItem}
              data-testid="assurance-item"
              data-accent={item.accent}
            >
              <div className={styles.assuranceEntry}>
                <span className={styles.assuranceIcon} aria-hidden="true">
                  {assuranceIcons[index]}
                </span>
                <span className={styles.assuranceCopy}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SignatureKnot() {
  return (
    <Image
      className={styles.signatureKnot}
      src="/marketing/signature/signature-knot.png"
      alt=""
      width={116}
      height={80}
      unoptimized
    />
  );
}

function ServiceMarquee() {
  return (
    <section
      className={styles.serviceMarquee}
      aria-label="Capabilități Sarbato"
      data-testid="service-marquee"
    >
      <div className={styles.serviceMarqueeViewport}>
        <div className={styles.serviceMarqueeTrack} data-testid="service-marquee-track">
          {[0, 1].map((groupIndex) => (
            <ul
              key={groupIndex}
              className={styles.serviceMarqueeGroup}
              data-marquee-group
              aria-hidden={groupIndex === 1 ? "true" : undefined}
            >
              {serviceMarquee.map((service, itemIndex) => (
                <li
                  key={`${groupIndex}-${service}`}
                  className={styles.serviceMarqueeItem}
                  data-accent={itemIndex % 3}
                >
                  {service}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}

function HeroControlRoom({ proof }: { proof: MarketingProductProof }) {
  const publishable = hasPublishablePublicProof(proof);
  const metricByKey = new Map(proof.metrics.map((metric) => [metric.key, metric]));

  return (
    <HeroShowcaseCycle
      dashboard={
        <section
          className={styles.controlRoom}
          aria-label="Product-first control room Sarbato"
        >
      <div className={styles.controlTopbar}>
        <span className={styles.controlMark} aria-hidden>
          S
        </span>
        <button className={styles.eventSelector} type="button" aria-label="Selectează spațiul evenimentului">
          Eveniment demonstrativ
          <ChevronDown aria-hidden />
        </button>
        <span
          data-testid="showcase-label"
          className={styles.previewLabel}
        >
          {publishable ? "Date agregate · actualizare verificată" : copy.previewLabel}
        </span>
        <label className={styles.searchField}>
          <span className="sr-only">Caută în eveniment</span>
          <Search aria-hidden />
          <input type="search" placeholder="Caută în eveniment" />
        </label>
      </div>

      <div className={styles.controlBody}>
        <nav className={styles.controlRail} aria-label="Module produs prezentate">
          {railIcons.map((Icon, index) => (
            <span key={index} className={index === 0 ? styles.railActive : undefined}>
              <Icon aria-hidden />
            </span>
          ))}
        </nav>

        <div className={styles.controlContent}>
          <h2>{copy.flowTitle}</h2>
          <div
            className={styles.flow}
            aria-label="Firul etapelor evenimentului"
          >
            <span className={styles.flowLine} aria-hidden />
            {copy.stages.map((stage, index) => {
              const Icon = stageIcons[index];
              return (
                <div
                  key={stage}
                  className={styles.flowStage}
                  data-stage-index={index + 1}
                >
                  <span className={styles.flowNode}>
                    <Icon aria-hidden />
                  </span>
                  <span>{stage}</span>
                </div>
              );
            })}
          </div>

          <div className={styles.recommendedAction}>
            <div>
              <p>{copy.recommendedAction.label}</p>
              <h3>{copy.recommendedAction.title}</h3>
              <span>{copy.recommendedAction.detail}</span>
            </div>
            <Link href="/create-account">{copy.recommendedAction.action}</Link>
          </div>

          <div className={styles.mobileNextStep} aria-label="Următorul pas recomandat">
            <p>Următorul pas</p>
            <Link href="/create-account">
              <span className={styles.mobileNextIcon} aria-hidden>
                <Mail />
              </span>
              <span className={styles.mobileNextCopy}>
                <strong>Trimite invitațiile</strong>
                <i aria-hidden><b /></i>
                <small>128 din 240 răspunsuri</small>
              </span>
              <ArrowRight aria-hidden />
            </Link>
          </div>

          <div
            className={styles.metricGrid}
            data-metric-source={publishable ? "aggregate" : "demo"}
            {...(publishable ? { "data-testid": "public-proof-metrics" } : {})}
          >
            {copy.metricCards.map((card) => {
              const metric = card.proofKey
                ? metricByKey.get(card.proofKey)
                : undefined;
              const MetricIcon = metricIcons[card.key];
              const visibleValue = publishable
                ? metric?.state === "published"
                  ? metric.value
                  : "Nespecificat"
                : card.demoValue;
              return (
                <article
                  key={card.key}
                  className={styles.metricCard}
                  data-metric-key={card.key}
                >
                  <div className={styles.metricHeader}>
                    <span className={toneClass[card.iconTone]} aria-hidden>
                      <MetricIcon />
                    </span>
                    <h3>{card.label}</h3>
                  </div>
                  <p>{card.detail}</p>
                  <strong>{visibleValue}</strong>
                  <span className={styles.metricBar} aria-hidden>
                    <i className={toneClass[card.barTone]} />
                  </span>
                  <Link className={styles.metricLink} href={card.href}>
                    {card.action}
                    <ArrowRight aria-hidden />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </div>
        </section>
      }
    />
  );
}

function StorySection({
  id,
  title,
  lead,
  link,
  href,
  icon: Icon,
  tone,
  layout = "default",
  last = false,
  children,
}: {
  id: string;
  title: string;
  lead: string;
  link: string;
  href: string;
  icon: typeof CalendarDays;
  tone: keyof typeof toneClass;
  layout?: "default" | "reverse";
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`${styles.story} ${last ? styles.storyLast : ""}`}
      data-story-section
      data-story-id={id}
      data-story-layout={layout}
    >
      <div
        className={`${styles.storyCopy} ${toneClass[tone]}`}
        data-story-copy
      >
        <span className={styles.chapterIcon}>
          <Icon aria-hidden />
        </span>
        <span className={styles.storyNode} data-story-node aria-hidden />
        <h2>{title}</h2>
        <p>{lead}</p>
        <Link href={href}>
          {link}
          <ArrowRight aria-hidden />
        </Link>
      </div>
      <div className={styles.storySurface}>{children}</div>
    </section>
  );
}

function PlanningSurface() {
  const chapter = copy.chapters.planning;
  return (
    <ProductPanel title={chapter.surfaceTitle} className={styles.planningPanel}>
      <div className={styles.planningToolbar} aria-label="Vizualizarea planului">
        <div className={styles.planningViewSwitch}>
          {chapter.tabs.map((view, index) => {
            const ViewIcon = index === 0 ? List : index === 1 ? CalendarDays : Columns3;
            return (
              <span
                key={view}
                className={index === 0 ? styles.planningViewActive : undefined}
              >
                <ViewIcon aria-hidden />
                {view}
              </span>
            );
          })}
        </div>
        <span className={styles.responsibilityFilter}>
          Toate responsabilitățile
          <ChevronDown aria-hidden />
        </span>
      </div>
      <div
        className={styles.tableScroll}
        role="region"
        aria-label="Tabelul activităților"
        tabIndex={0}
      >
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Activitate</th>
              <th>Responsabil</th>
              <th>Termen</th>
              <th>Stare</th>
            </tr>
          </thead>
          <tbody>
            {chapter.rows.map((row, index) => (
              <tr key={row[0]}>
                <td data-label="Activitate">{row[0]}</td>
                <td data-label="Responsabil">
                  <span className={styles.responsibleCell}>
                    <span
                      className={styles.responsibilityAvatar}
                      data-avatar-tone={index % 4}
                      aria-hidden
                    >
                      {row[1].slice(0, 1)}
                    </span>
                    {row[1]}
                  </span>
                </td>
                <td data-label="Termen">{row[2]}</td>
                <td data-label="Stare">
                  <Status value={row[3]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className={styles.addAction} type="button">
        + Activitate nouă
      </button>
    </ProductPanel>
  );
}

function GuestsSurface() {
  const chapter = copy.chapters.guests;
  return (
    <ProductPanel
      title={chapter.surfaceTitle}
      actions={["Importă", "Segmente", "Trimite invitații"]}
      primaryAction="Trimite invitații"
      actionIcons={{ Importă: Download, Segmente: List }}
      className={styles.guestsPanel}
    >
      <div className={styles.tabs} aria-label="Filtre invitați">
        {chapter.tabs.map((tab, index) => (
          <span key={tab} className={index === 0 ? styles.tabActive : undefined}>
            {tab}
          </span>
        ))}
      </div>
      <div className={styles.guestTableFrame} data-demo-content="guest-preview">
        <div
          className={styles.tableScroll}
          role="region"
          aria-label="Tabelul invitaților"
          tabIndex={0}
        >
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Nume</th>
                <th>Email</th>
                <th>Segment</th>
                <th>Status RSVP</th>
                <th><span className="sr-only">Mesaj</span></th>
                <th><span className="sr-only">Mai multe acțiuni</span></th>
              </tr>
            </thead>
            <tbody>
              {chapter.rows.map((row, index) => (
                <tr key={row[0]}>
                  <td data-label="Nume">{row[0]}</td>
                  <td data-label="Email">{row[1]}</td>
                  <td data-label="Segment">{row[2]}</td>
                  <td data-label="Status RSVP">
                    <Status value={row[3]} />
                  </td>
                  <td className={styles.guestIconCell}>
                    {index < 2 ? <Mail aria-hidden /> : null}
                  </td>
                  <td className={styles.guestIconCell}><Ellipsis aria-hidden /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.panelFooter}>
          <button type="button">+ Adaugă invitat</button>
          <button type="button">
            <Upload aria-hidden />
            Exportă lista
          </button>
        </div>
      </div>
    </ProductPanel>
  );
}

function CommerceSurface() {
  const chapter = copy.chapters.commerce;
  return (
    <div
      className={`${styles.productPanel} ${styles.commercePanel}`}
      data-demo-content="commerce-preview"
    >
      <div className={styles.commerceGrid}>
        <section aria-labelledby="vendors-preview-title" className={styles.vendorPane}>
          <div className={styles.subpanelHeading}>
            <h3 id="vendors-preview-title">{chapter.vendorsTitle}</h3>
            <span className={styles.categoryFilter}>
              Categorie: Toate
              <ChevronDown aria-hidden />
            </span>
          </div>
          <div
            className={styles.vendorMatrixScroll}
            role="region"
            aria-label="Comparație furnizori"
            tabIndex={0}
          >
            <table className={styles.vendorMatrix}>
              <thead>
                <tr>
                  <th><span className="sr-only">Criteriu</span></th>
                  {chapter.vendors.map((vendor) => (
                    <th key={vendor.name}>
                      <strong>{vendor.name}</strong>
                      <span>{vendor.category}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Preț total (RON)</th>
                  {chapter.vendors.map((vendor) => (
                    <td key={vendor.name}>
                      <strong>{vendor.price}</strong>
                      {vendor.recommended ? (
                        <span className={styles.recommendedBadge}>Recomandat</span>
                      ) : null}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Disponibilitate</th>
                  {chapter.vendors.map((vendor) => (
                    <td key={vendor.name}>{vendor.availability}</td>
                  ))}
                </tr>
                <tr>
                  <th>Evaluare internă</th>
                  {chapter.vendors.map((vendor) => (
                    <td key={vendor.name}>
                      <span
                        className={styles.rating}
                        role="img"
                        aria-label={`${vendor.rating} din 5 stele`}
                      >
                        {Array.from({ length: 5 }, (_, index) => (
                          <Star
                            key={index}
                            aria-hidden
                            data-active={index < vendor.rating}
                          />
                        ))}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Termen de plată</th>
                  {chapter.vendors.map((vendor) => (
                    <td key={vendor.name}>{vendor.paymentTerm}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div
            className={styles.vendorCards}
            role="list"
            aria-label="Comparație furnizori, listă glisabilă pe mobil"
            tabIndex={0}
          >
            {chapter.vendors.map((vendor) => (
              <article
                key={vendor.name}
                className={styles.vendorCard}
                role="listitem"
              >
                <header>
                  <div>
                    <strong>{vendor.name}</strong>
                    <span>{vendor.category}</span>
                  </div>
                  {vendor.recommended ? (
                    <span className={styles.recommendedBadge}>Recomandat</span>
                  ) : null}
                </header>
                <dl>
                  <div>
                    <dt>Preț total</dt>
                    <dd>{vendor.price} RON</dd>
                  </div>
                  <div>
                    <dt>Disponibilitate</dt>
                    <dd>{vendor.availability}</dd>
                  </div>
                  <div>
                    <dt>Evaluare internă</dt>
                    <dd>
                      <span
                        className={styles.rating}
                        role="img"
                        aria-label={`${vendor.rating} din 5 stele`}
                      >
                        {Array.from({ length: 5 }, (_, index) => (
                          <Star
                            key={index}
                            aria-hidden
                            data-active={index < vendor.rating}
                          />
                        ))}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Termen de plată</dt>
                    <dd>{vendor.paymentTerm}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <button className={styles.centerAction} type="button">Vezi detalii și contacte</button>
        </section>
        <section aria-labelledby="budget-preview-title" className={styles.budgetPane}>
          <div className={styles.subpanelHeading}>
            <h3 id="budget-preview-title">{chapter.budgetTitle}</h3>
            <span>Vezi raport</span>
          </div>
          <div className={styles.budgetSummaryExact}>
            <div>
              <span>Total buget</span>
              <strong>{chapter.budgetTotal}</strong>
            </div>
            <div>
              <span>Cheltuit</span>
              <strong>
                {chapter.budgetSpent} <small>({chapter.budgetSpentPercent})</small>
              </strong>
            </div>
          </div>
          <span className={styles.budgetTotalBar} aria-hidden>
            <i style={{ width: chapter.budgetSpentPercent }} />
          </span>
          <div className={`${styles.budgetBreakdown} budgetBreakdown__proof`}>
            <div className={styles.budgetBreakdownHeader}>
              <span>Categorie</span>
              <span>Cheltuit</span>
            </div>
            {chapter.budgetRows.map(([label, amount, value]) => (
              <div className={styles.budgetBreakdownRow} key={label}>
                <span>{label}</span>
                <span>{amount}</span>
                <i aria-hidden><b style={{ width: value }} /></i>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function OperationsSurface() {
  const chapter = copy.chapters.operations;
  return (
    <ProductPanel title={chapter.surfaceTitle} className={styles.operationsPanel}>
      <div className={styles.mobileOperationsSummary}>
        <div>
          <Image
            alt=""
            aria-hidden
            className={styles.operationAvatar}
            height={20}
            loading="eager"
            src={chapter.team[0][3]}
            unoptimized
            width={20}
          />
          <span>Echipă</span>
          <strong>3 online</strong>
        </div>
        <div>
          <Store aria-hidden />
          <span>Furnizori</span>
          <strong data-tone="warning">1 pe teren</strong>
        </div>
        <div>
          <CalendarDays aria-hidden />
          <span>Program</span>
          <strong>Deschidere eveniment</strong>
        </div>
      </div>
      <div className={styles.operationsGrid}>
        <section aria-labelledby="schedule-preview-title">
          <div className={styles.operationsColumnHeading}>
            <h3 id="schedule-preview-title">Program</h3>
            <span>Vezi tot</span>
          </div>
          <div className={styles.scheduleList}>
            {chapter.schedule.map(([time, item, active]) => (
              <div
                className={`${styles.operationRow} ${active ? styles.operationRowActive : ""}`}
                key={time}
              >
                <time>{time}</time>
                <i aria-hidden />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>
        <section aria-labelledby="team-preview-title">
          <div className={styles.operationsColumnHeading}>
            <h3 id="team-preview-title">Echipă</h3>
            <span>Vezi tot</span>
          </div>
          {chapter.team.map(([name, role, state, avatar]) => (
            <div className={styles.peopleRow} key={name}>
              <Image
                alt=""
                aria-hidden
                className={styles.operationAvatar}
                height={22}
                loading="eager"
                src={avatar}
                unoptimized
                width={22}
              />
              <span className={styles.operationIdentity}>
                <strong>{name}</strong>
                <small>{role}</small>
              </span>
              <OperationPresence value={state} />
            </div>
          ))}
        </section>
        <section aria-labelledby="field-vendors-title">
          <div className={styles.operationsColumnHeading}>
            <h3 id="field-vendors-title">Furnizori</h3>
            <span>Vezi tot</span>
          </div>
          {chapter.vendors.map(([vendor, category, state, avatar]) => (
            <div className={styles.peopleRow} key={vendor}>
              <Image
                alt=""
                aria-hidden
                className={styles.operationAvatar}
                height={22}
                loading="eager"
                src={avatar}
                unoptimized
                width={22}
              />
              <span className={styles.operationIdentity}>
                <strong>{vendor}</strong>
                <small>{category}</small>
              </span>
              <OperationPresence value={state} />
            </div>
          ))}
        </section>
      </div>
      <div className={styles.alertBar}>
        <Bell aria-hidden />
        <span>Alerte și actualizări</span>
        <time>11:42</time>
        <p>Livrarea echipamentelor a fost confirmată.</p>
        <button type="button">Vezi toate</button>
      </div>
    </ProductPanel>
  );
}

function OperationPresence({ value }: { value: string }) {
  const warning = value === "Pe teren";
  const danger = value === "Pe drum";
  return (
    <span
      className={`${styles.operationPresence} ${
        danger
          ? styles.operationPresenceDanger
          : warning
            ? styles.operationPresenceWarning
            : styles.operationPresenceSuccess
      }`}
    >
      {value}
    </span>
  );
}

function ProductPanel({
  title,
  actions = [],
  primaryAction,
  actionIcons,
  className,
  children,
}: {
  title: string;
  actions?: readonly string[];
  primaryAction?: string;
  actionIcons?: Partial<Record<string, typeof CalendarDays>>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.productPanel} ${className ?? ""}`}>
      <div className={styles.panelHeading}>
        <h3>{title}</h3>
        <span className={styles.mobilePanelAction} aria-hidden>
          <ArrowRight />
        </span>
        {actions.length ? (
          <div className={styles.panelActions}>
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                className={action === primaryAction ? styles.panelPrimary : undefined}
              >
                {actionIcons?.[action]
                  ? (() => {
                      const ActionIcon = actionIcons[action]!;
                      return <ActionIcon aria-hidden />;
                    })()
                  : null}
                {action}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Status({ value }: { value: string }) {
  const normalized = value.toLocaleLowerCase("ro-RO");
  const state =
    normalized.includes("nu a") || normalized.includes("drum")
      ? "danger"
      : normalized.includes("final") || normalized.includes("online") || normalized.includes("răspuns") || normalized.includes("recomand") || normalized.includes("fața")
      ? "success"
      : normalized.includes("progres") || normalized.includes("desfăș") || normalized.includes("teren") || normalized.includes("evalu") || normalized.includes("urmează")
        ? "warning"
        : "neutral";
  return <span className={`${styles.status} ${styles[`status${state}`]}`}>{value}</span>;
}
