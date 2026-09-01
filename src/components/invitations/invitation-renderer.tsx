"use client";

import * as React from "react";
import {
  BedDouble,
  CalendarPlus,
  ExternalLink,
  Gift,
  Images,
  MapPin,
  Phone,
  Play,
  Shirt,
} from "lucide-react";
import {
  array,
  stringArray,
  text,
  type InvitationDesign,
  type InvitationDevice,
  type InvitationEditorSnapshot,
  type InvitationSection,
} from "@/lib/invitations/editor-model";
import { resolveInvitationTextStyle } from "@/lib/invitations/editor-elements";
import {
  invitationContentValue,
  invitationEditableField,
} from "@/lib/invitations/editor-content";
import { cn } from "@/lib/utils";
import {
  contrastRatio,
  ensureReadableTextColor,
} from "./invitation-experience";
import styles from "./invitation-renderer.module.css";

export type InvitationMediaResolver = (
  mediaId: string,
  externalUrl?: string,
) => string;

export type InvitationSectionFrame = (input: {
  section: InvitationSection;
  children: React.ReactNode;
}) => React.ReactNode;

export type InvitationRendererProps = {
  snapshot: InvitationEditorSnapshot;
  resolveMedia: InvitationMediaResolver;
  onAddCalendar?: () => void;
  onRsvp?: () => void;
  rsvpHref?: string;
  onContentChange?: (
    sectionId: string,
    key: string,
    value: string,
  ) => void;
  onContentFocus?: (
    sectionId: string,
    key: string,
    mode?: "direct" | "structured",
  ) => void;
  activeContent?: { sectionId: string; key: string } | null;
  inlineEditing?: boolean;
  editorDevice?: InvitationDevice;
  canvasScale?: number;
  onContentMove?: (
    sectionId: string,
    key: string,
    position: { offsetX: number; offsetY: number },
  ) => void;
  renderSectionFrame?: InvitationSectionFrame;
  className?: string;
  emptyState?: React.ReactNode;
  articleRef?: React.Ref<HTMLElement>;
};

/**
 * The canonical invitation renderer. Editor and guest surfaces deliberately
 * share this component so a published invitation cannot drift from preview.
 */
export function InvitationRenderer({
  snapshot,
  resolveMedia,
  onAddCalendar,
  onRsvp,
  rsvpHref,
  onContentChange,
  onContentFocus,
  activeContent,
  inlineEditing = true,
  editorDevice = "desktop",
  canvasScale = 1,
  onContentMove,
  renderSectionFrame,
  className,
  emptyState,
  articleRef,
}: InvitationRendererProps) {
  const [editorGuide, setEditorGuide] = React.useState<EditorGuide | null>(null);
  const visibleSections = snapshot.sections.filter((section) => section.visible);
  const { design } = snapshot;
  const defaultTimeZone = invitationTimeZone(snapshot.sections);

  return (
    <article
      ref={articleRef}
      tabIndex={-1}
      className={cn(
        "overflow-hidden outline-none [container-name:invitation-canvas] [container-type:inline-size] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4",
        styles.invitation,
        design.template === "nocturne" && styles.nocturne,
        radiusClass(design.radius),
        className,
      )}
      style={{
        backgroundColor: validColor(design.background),
        color: ensureReadableTextColor(
          validColor(design.background),
          validColor(design.text),
        ),
      }}
      data-template={design.template}
      data-invitation-renderer
    >
      {visibleSections.map((section) => {
        const content = (
          <InvitationSectionView
            key={section.id}
            section={section}
            design={design}
            resolveMedia={resolveMedia}
            onAddCalendar={onAddCalendar}
            onRsvp={onRsvp}
            rsvpHref={rsvpHref}
            onContentChange={onContentChange}
            onContentFocus={onContentFocus}
            activeContent={activeContent}
            inlineEditing={inlineEditing}
            editorDevice={editorDevice}
            canvasScale={canvasScale}
            onContentMove={onContentMove}
            editorGuide={
              editorGuide?.sectionId === section.id ? editorGuide : null
            }
            onEditorGuideChange={setEditorGuide}
            defaultTimeZone={defaultTimeZone}
          />
        );

        return (
          <React.Fragment key={section.id}>
            {renderSectionFrame
              ? renderSectionFrame({ section, children: content })
              : content}
          </React.Fragment>
        );
      })}
      {!visibleSections.length &&
        (emptyState ?? (
          <div className="grid min-h-96 place-items-center p-8 text-center text-sm opacity-60">
            Invitația nu are încă secțiuni vizibile.
          </div>
        ))}
    </article>
  );
}

type InvitationSectionViewProps = {
  section: InvitationSection;
  design: InvitationDesign;
  resolveMedia: InvitationMediaResolver;
  onAddCalendar?: () => void;
  onRsvp?: () => void;
  rsvpHref?: string;
  onContentChange?: InvitationRendererProps["onContentChange"];
  onContentFocus?: InvitationRendererProps["onContentFocus"];
  activeContent?: InvitationRendererProps["activeContent"];
  inlineEditing?: boolean;
  editorDevice: InvitationDevice;
  canvasScale: number;
  onContentMove?: InvitationRendererProps["onContentMove"];
  editorGuide: EditorGuide | null;
  onEditorGuideChange: (guide: EditorGuide | null) => void;
  defaultTimeZone?: string;
};

type EditorGuide = {
  sectionId: string;
  x?: number;
  y?: number;
};

export function InvitationSectionView(props: InvitationSectionViewProps) {
  const rendered = InvitationSectionContent(props);
  const element = rendered as React.ReactElement<{
    className?: string;
    children?: React.ReactNode;
    "data-invitation-section"?: string;
  }>;
  return React.cloneElement(
    element,
    {
      className: cn(
        element.props.className,
        styles.invitationSection,
        array(props.section.content.decorations).length &&
          styles.decoratedSection,
        (props.section.style.backgroundMode === "image" ||
          (props.section.type === "hero" &&
            String(props.section.content.layout ?? "immersive") ===
              "immersive")) &&
          styles.imageBackedSection,
      ),
      "data-invitation-section": props.section.type,
    },
    element.props.children,
    props.editorGuide ? (
      <EditorAlignmentGuides guide={props.editorGuide} />
    ) : null,
    array(props.section.content.decorations).length ? (
      <InvitationDecorations
        section={props.section}
        resolveMedia={props.resolveMedia}
        artDirection={invitationArtDirection(props.section.content)}
      />
    ) : null,
  );
}

function InvitationSectionContent({
  section,
  design,
  resolveMedia,
  onAddCalendar,
  onRsvp,
  rsvpHref,
  onContentChange,
  onContentFocus,
  activeContent,
  inlineEditing,
  editorDevice,
  canvasScale,
  onContentMove,
  onEditorGuideChange,
  defaultTimeZone,
}: InvitationSectionViewProps) {
  const content = section.content;
  const center = section.style.align === "center";
  const right = section.style.align === "right";
  const alignClass = center
    ? "text-center"
    : right
      ? "text-right"
      : "text-left";
  const headingClass =
    design.headingFont === "display"
      ? "font-display font-semibold"
      : "font-sans font-semibold tracking-tight";
  const commonClass = cn("relative", styles.sectionPadding, alignClass);
  const tone = sectionTone(section, design, resolveMedia);
  const commonStyle: React.CSSProperties = {
    ...tone,
    paddingBlock: sectionPadding(section.style.padding, design.spacing),
  };
  const buttonClass = invitationButtonClass(design);
  const editorMode = Boolean(onContentFocus);
  const edit = (key: string, fallback = "") => {
    const value = text(invitationContentValue(content, key), fallback);
    const label =
      invitationEditableField(section, key)?.label ??
      invitationTextLabel(section.type, key);
    const active =
      activeContent?.sectionId === section.id && activeContent.key === key;
    const style = invitationEditableTextStyle(content, key);
    const interaction = resolveInvitationTextStyle(content, key, editorDevice);
    if (onContentFocus && inlineEditing === false)
      return (
        <InvitationStructuredText
          value={value}
          label={label}
          contentKey={key}
          style={style}
          active={active}
          onActivate={() => onContentFocus(section.id, key, "structured")}
        />
      );
    return (
      <InvitationText
        value={value}
        onCommit={
          onContentChange
            ? (nextValue) => onContentChange(section.id, key, nextValue)
            : undefined
        }
        onFocus={
          onContentFocus
            ? () => onContentFocus(section.id, key, "direct")
            : undefined
        }
        label={label}
        contentKey={key}
        style={style}
        active={active}
        device={editorDevice}
        canvasScale={canvasScale}
        offsetX={interaction.offsetX ?? 0}
        offsetY={interaction.offsetY ?? 0}
        locked={interaction.locked === true}
        onMove={
          onContentMove
            ? (position) => onContentMove(section.id, key, position)
            : undefined
        }
        onGuideChange={(guide) =>
          onEditorGuideChange(
            guide ? { sectionId: section.id, ...guide } : null,
          )
        }
      />
    );
  };
  const inspect = (key: string, value: string) => (
    <InvitationStructuredText
      value={value}
      label={invitationEditableField(section, key)?.label ?? "detaliul"}
      contentKey={key}
      style={invitationEditableTextStyle(content, key)}
      active={
        activeContent?.sectionId === section.id && activeContent.key === key
      }
      onActivate={
        onContentFocus
          ? () => onContentFocus(section.id, key, "structured")
          : undefined
      }
    />
  );

  if (section.type === "hero") {
    const resolvedImage = resolveMedia(
      text(content.mediaId),
      text(content.coverImage),
    );
    const image =
      resolvedImage ||
      (design.template === "nocturne"
        ? "/invitation-art/nocturne-glass.webp"
        : "");
    const layout = text(content.layout, "immersive");
    const isImmersive = Boolean(image && layout === "immersive");
    const heroHeight = clampNumber(content.heroHeight, 420, 900, 620);
    const headingMax = clampNumber(content.headingSize, 38, 96, 76);
    const artDirection = invitationArtDirection(content);
    const artDirectionStyle = invitationArtDirectionStyle(
      artDirection,
      headingMax,
    );
    const textBlock = (
      <div
        className={cn(
          "relative z-10 w-full",
          isImmersive && "text-white",
          center && "mx-auto",
          right && "ml-auto",
          styles.heroCopy,
        )}
        style={heroCopyStyle(content)}
      >
        <p className="text-xs font-semibold uppercase tracking-[.22em] opacity-75">
          {edit("eyebrow")}
        </p>
        <h1
          className={cn(
            headingClass,
            styles.heroHeading,
          )}
          style={{
            ...artDirectionStyle,
            ...(!isImmersive ? { color: design.accent } : {}),
          }}
        >
          {edit("names")}
        </h1>
        <div
          className={cn(
            "flex flex-wrap gap-x-3 gap-y-1 text-sm",
            styles.heroMeta,
            center && "justify-center",
            right && "justify-end",
          )}
        >
          <span>{edit("date")}</span>
          <span aria-hidden>·</span>
          <span>{edit("venue")}</span>
        </div>
        <h2 className={cn(headingClass, styles.heroSubheading)}>
          {edit("title")}
        </h2>
        <p
          className={cn(
            "max-w-xl whitespace-pre-line text-sm leading-relaxed opacity-80",
            styles.heroSubtitle,
            center && "mx-auto",
            right && "ml-auto",
          )}
        >
          {edit("subtitle")}
        </p>
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            styles.heroActions,
            center && "justify-center",
            right && "justify-end",
          )}
        >
          {text(content.buttonLabel) ? (
            <RsvpAction
              label={edit("buttonLabel", "Confirmă prezența")}
              className={buttonClass}
              design={design}
              inverted={isImmersive}
              onRsvp={onRsvp}
              href={rsvpHref}
              editorMode={editorMode}
            />
          ) : null}
          {onAddCalendar ? (
            <button
              type="button"
              onClick={onAddCalendar}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 border border-current/30 px-5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2",
                buttonRadiusClass(design),
              )}
            >
              <CalendarPlus className="size-4" aria-hidden />
              Adaugă în calendar
            </button>
          ) : null}
        </div>
      </div>
    );

    if (layout === "split") {
      return (
        <section
          id={sectionAnchor(section)}
          className={cn(styles.heroSplit, styles.artDirected)}
          style={{ ...tone, ...artDirectionStyle }}
        >
          <div
            className={cn(
              "flex",
              styles.heroSplitContent,
              alignClass,
              contentYClass(text(content.contentY, "center")),
            )}
          >
            {textBlock}
          </div>
          <InvitationImage
            src={image}
            alt={text(content.imageAlt, "")}
            className="min-h-72"
            focalX={clampNumber(content.focalX, 0, 100, 50)}
            focalY={clampNumber(content.focalY, 0, 100, 50)}
            artDirection={artDirection}
          />
        </section>
      );
    }

    if (layout === "minimal") {
      return (
        <section
          id={sectionAnchor(section)}
          className={cn(commonClass, "overflow-hidden", styles.artDirected)}
          style={{ ...commonStyle, minHeight: heroHeight, ...artDirectionStyle }}
        >
          <div className={cn("mx-auto max-w-2xl", right && "ml-auto mr-0")}>
            {textBlock}
          </div>
          {image ? (
            <InvitationImage
              src={image}
              alt={text(content.imageAlt, "")}
              className={cn("mt-10 aspect-[16/7]", radiusClass(design.radius))}
              focalX={clampNumber(content.focalX, 0, 100, 50)}
              focalY={clampNumber(content.focalY, 0, 100, 50)}
              artDirection={artDirection}
            />
          ) : null}
        </section>
      );
    }

    return (
      <section
        id={sectionAnchor(section)}
        className={cn(
          commonClass,
          "flex overflow-hidden",
          contentYClass(text(content.contentY, "bottom")),
          styles.artDirected,
        )}
        style={{
          ...commonStyle,
          minHeight: heroHeight,
          backgroundImage: image
            ? `linear-gradient(${colorWithAlpha(text(content.overlayColor, "#14251D"), clampNumber(content.overlayOpacity, 0, 100, 46))},${colorWithAlpha(text(content.overlayColor, "#14251D"), clampNumber(content.overlayOpacity, 0, 100, 46))}),url("${cssUrl(image)}")`
            : commonStyle.backgroundImage,
          backgroundSize: "cover",
          ...artDirectionStyle,
        }}
      >
        {textBlock}
      </section>
    );
  }

  if (section.type === "story") {
    return (
      <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}>
        <p className="text-xs font-semibold uppercase tracking-[.22em] opacity-70">
          Despre noi
        </p>
        <h2
          className={cn("mt-3", headingClass, styles.responsiveHeading)}
          style={sectionHeadingStyle(section, design)}
        >
          {edit("title")}
        </h2>
        <p className={cn("mt-5 max-w-2xl text-sm leading-7 opacity-80", center && "mx-auto", right && "ml-auto")}>
          {edit("body")}
        </p>
        {text(content.quote) ? (
          <blockquote
            className={cn(
              "mt-7 max-w-xl border-current/20 text-lg italic leading-relaxed opacity-85",
              center
                ? "mx-auto border-y py-5"
                : right
                  ? "ml-auto border-r pr-5"
                  : "border-l pl-5",
            )}
          >
            {edit("quote")}
          </blockquote>
        ) : null}
      </section>
    );
  }

  if (section.type === "countdown") {
    return (
      <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}>
        <h2 className={cn(headingClass, styles.countdownHeading)}>{edit("title")}</h2>
        <InvitationCountdown
          date={text(content.date)}
          center={center}
          headingClass={headingClass}
          accent={design.accent}
        />
      </section>
    );
  }

  if (section.type === "schedule") {
    return (
      <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}>
        <SectionHeading section={section} design={design} className={headingClass}>{edit("title")}</SectionHeading>
        <div className={cn("mt-8", styles.scheduleList, center && "mx-auto max-w-xl", right && "ml-auto max-w-xl")}>
          {array(content.items).map((item, index) => (
            <div key={index} className={cn("grid grid-cols-[62px_minmax(0,1fr)] gap-4 border-t border-current/15 py-4 text-left first:border-t-0", styles.scheduleItem)}>
              <p className={cn("text-sm font-semibold tabular-nums", styles.scheduleTime)} style={{ color: design.accent }}>
                {inspect(`items.${index}.time`, invitationDisplayTime(text(item.time)))}
              </p>
              <div>
                <p className="text-sm font-semibold">{edit(`items.${index}.title`)}</p>
                <p className="mt-1 text-xs leading-relaxed opacity-65">{edit(`items.${index}.detail`)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (section.type === "locations") {
    return (
      <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}>
        <SectionHeading section={section} design={design} className={headingClass}>{edit("title")}</SectionHeading>
        <div className={cn("mt-8 gap-3", styles.twoColumnGrid, center && "mx-auto max-w-2xl", right && "ml-auto max-w-2xl")}>
          {array(content.items).map((item, index) => {
            const url = safeLink(text(item.url));
            const cardClass = cn("block border border-current/15 p-5 text-left transition-colors", radiusClass(design.radius), url && "hover:bg-black/[.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current");
            const card = <><MapPin className="size-5" style={{ color: design.accent }} aria-hidden /><p className="mt-4 text-sm font-semibold">{edit(`items.${index}.name`)}</p><p className="mt-1 text-xs leading-relaxed opacity-65">{edit(`items.${index}.address`)}</p>{url ? <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-4">Deschide harta<ExternalLink className="size-3" aria-hidden /></span> : null}</>;
            return url && !editorMode ? <a key={index} href={url} target="_blank" rel="noreferrer" className={cardClass}>{card}</a> : <div key={index} className={cardClass}>{card}</div>;
          })}
        </div>
      </section>
    );
  }

  if (section.type === "rsvp") {
    const deadline = invitationDisplayDeadline(
      text(content.deadline),
      text(content.deadlineTimezone) || defaultTimeZone,
    );
    return (
      <section id="confirmare-invitatie" className={commonClass} style={commonStyle}>
        <p className="text-xs font-semibold uppercase tracking-[.22em] opacity-70">RSVP</p>
        <h2 className={cn("mt-3", headingClass, styles.responsiveHeading)}>{edit("title")}</h2>
        <p className={cn("mt-4 max-w-xl text-sm leading-relaxed opacity-75", center && "mx-auto", right && "ml-auto")}>{edit("body")}</p>
        <p className="mt-3 text-xs font-semibold opacity-75">
          Până pe{" "}
          {inspect("deadline", deadline)}
        </p>
        {text(content.buttonLabel) ? <RsvpAction label={edit("buttonLabel")} className={cn("mt-7", buttonClass)} design={design} inverted={section.style.tone === "accent" || section.style.tone === "dark"} onRsvp={onRsvp} href={rsvpHref} editorMode={editorMode} /> : null}
      </section>
    );
  }

  if (section.type === "dress_code") {
    return (
      <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}>
        <Shirt className={cn("size-5 opacity-70", center && "mx-auto", right && "ml-auto")} aria-hidden />
        <h2 className={cn("mt-4 text-3xl", headingClass)}>{edit("title")}</h2>
        <p className={cn("mt-3 max-w-xl text-sm leading-relaxed opacity-75", center && "mx-auto", right && "ml-auto")}>{edit("body")}</p>
        <div className={cn("mt-6 flex flex-wrap gap-2", center && "justify-center", right && "justify-end")}>
          {stringArray(content.colors).map((color, index) => <span key={`${color}-${index}`} className="size-8 rounded-full border border-black/10" style={{ backgroundColor: validColor(color) }} title={color} />)}
        </div>
      </section>
    );
  }

  if (section.type === "gallery") {
    const items = array(content.items);
    const layout = text(content.layout, "mosaic");
    return (
      <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}>
        <SectionHeading section={section} design={design} className={headingClass}>{edit("title")}</SectionHeading>
        <p className={cn("mt-3 max-w-xl text-sm leading-relaxed opacity-75", center && "mx-auto", right && "ml-auto")}>{edit("body")}</p>
        {items.length ? (
          <div className={cn("mt-8 gap-2", layout === "filmstrip" ? "flex snap-x snap-mandatory overflow-x-auto pb-2" : cn("grid grid-cols-2", styles.galleryMosaic), center && layout !== "filmstrip" && "mx-auto max-w-2xl", right && layout !== "filmstrip" && "ml-auto max-w-2xl")}>
            {items.map((item, index) => {
              const image = resolveMedia(text(item.mediaId), text(item.url));
              return <figure key={index} className={cn("overflow-hidden bg-black/5", radiusClass(design.radius), layout === "mosaic" && index === 0 && items.length > 2 && "col-span-2 row-span-2", layout === "filmstrip" && cn("shrink-0 snap-center", styles.filmstripItem))}><InvitationImage src={image} alt={text(item.alt, text(item.caption))} className="aspect-square" />{text(item.caption) ? <figcaption className="px-3 py-2 text-xs leading-relaxed opacity-75">{edit(`items.${index}.caption`)}</figcaption> : null}</figure>;
            })}
          </div>
        ) : onContentChange ? <MediaPlaceholder radius={design.radius} /> : null}
      </section>
    );
  }

  if (section.type === "faq") {
    return (
      <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}>
        <SectionHeading section={section} design={design} className={headingClass}>{edit("title")}</SectionHeading>
        <div className={cn("mt-7 divide-y divide-current/15 border-y border-current/15 text-left", center && "mx-auto max-w-2xl", right && "ml-auto max-w-2xl")}>
          {array(content.items).map((item, index) => editorMode ? <div key={index} className="py-4"><p className="min-h-11 py-2 text-sm font-semibold">{edit(`items.${index}.question`)}</p><p className="pb-2 text-xs leading-relaxed opacity-70">{edit(`items.${index}.answer`)}</p></div> : <details key={index} className="group py-4"><summary className="min-h-11 cursor-pointer list-none py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current">{edit(`items.${index}.question`)}</summary><p className="pb-2 text-xs leading-relaxed opacity-70">{edit(`items.${index}.answer`)}</p></details>)}
        </div>
      </section>
    );
  }

  if (section.type === "accommodation") {
    return (
      <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}>
        <BedDouble className={cn("size-5 opacity-70", center && "mx-auto", right && "ml-auto")} aria-hidden />
        <h2 className={cn("mt-4 text-3xl", headingClass)}>{edit("title")}</h2>
        <p className={cn("mt-3 max-w-xl text-sm leading-relaxed opacity-75", center && "mx-auto", right && "ml-auto")}>{edit("body")}</p>
        <div className={cn("mt-6 divide-y divide-current/15 border-y border-current/15 text-left", center && "mx-auto max-w-2xl", right && "ml-auto max-w-2xl")}>
          {array(content.items).map((item, index) => {
            const url = safeLink(text(item.url));
            const inner = <><div><p className="text-sm font-semibold">{edit(`items.${index}.name`)}</p><p className="mt-1 text-xs leading-relaxed opacity-70">{edit(`items.${index}.detail`)}</p></div>{url ? <ExternalLink className="size-4 shrink-0 opacity-60" aria-hidden /> : null}</>;
            return url && !editorMode ? <a key={index} href={url} target="_blank" rel="noreferrer" className="flex min-h-14 items-center justify-between gap-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current">{inner}</a> : <div key={index} className="flex min-h-14 items-center justify-between gap-4 py-3">{inner}</div>;
          })}
        </div>
      </section>
    );
  }

  if (section.type === "registry") {
    return (
      <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}>
        <Gift className={cn("size-5 opacity-70", center && "mx-auto", right && "ml-auto")} aria-hidden />
        <GenericSectionBody section={section} design={design} headingClass={headingClass} edit={edit} />
        <ExternalAction content={content} label={edit("buttonLabel")} className={cn("mt-6", buttonClass)} design={design} inverted={isInverted(section)} editorMode={editorMode} />
      </section>
    );
  }

  if (section.type === "contact") {
    const phone = text(content.phone);
    return (
      <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}>
        <GenericSectionBody section={section} design={design} headingClass={headingClass} edit={edit} />
        {text(content.name) || phone ? <div className={cn("mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold", center && "justify-center", right && "justify-end")}><Phone className="size-4" aria-hidden /><span>{edit("name")}</span>{text(content.name) && phone ? <span aria-hidden>·</span> : null}{phone ? editorMode ? <span className="underline underline-offset-4">{inspect("phone", phone)}</span> : <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current">{inspect("phone", phone)}</a> : null}</div> : null}
      </section>
    );
  }

  if (section.type === "custom") {
    const blockKind = text(content.blockKind);
    const advancedArtDirection = invitationArtDirection(content);
    const advancedArtStyle = invitationArtDirectionStyle(
      advancedArtDirection,
      48,
    );
    if (blockKind === "divider") {
      return <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}><div className="mx-auto flex max-w-2xl items-center gap-4" aria-hidden={!text(content.label)}><span className="h-px flex-1 bg-current opacity-20"/><span className={cn("font-display text-2xl", !text(content.label) && "text-3xl")}>{text(content.label) ? edit("label") : edit("ornament", "✦")}</span><span className="h-px flex-1 bg-current opacity-20"/></div></section>;
    }
    if (blockKind === "artwork") {
      const image = resolveMedia(text(content.mediaId), text(content.url));
      return <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}>{text(content.title) ? <h2 className={cn("mb-6", headingClass, styles.advancedHeading, styles.artDirected)} style={{ ...advancedArtStyle, ...sectionHeadingStyle(section, design) }}>{edit("title")}</h2> : null}<figure className={cn("mx-auto max-w-3xl overflow-hidden", radiusClass(design.radius))}><InvitationImage src={image} alt={text(content.alt)} className={styles.artworkImage} artDirection={advancedArtDirection} />{text(content.caption) ? <figcaption className="px-4 py-3 text-xs leading-relaxed opacity-70">{edit("caption")}</figcaption> : null}</figure></section>;
    }
    if (blockKind === "video") {
      const videoUrl = safeLink(text(content.url));
      const poster = resolveMedia(text(content.posterMediaId), text(content.posterUrl));
      return <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}><h2 className={cn(headingClass, styles.advancedHeading, styles.artDirected)} style={{ ...advancedArtStyle, ...sectionHeadingStyle(section, design) }}>{edit("title")}</h2>{videoUrl ? <video className={cn("mx-auto mt-6 aspect-video w-full max-w-3xl bg-black object-cover", radiusClass(design.radius), styles.artDirectedImage)} style={advancedArtStyle} src={videoUrl} poster={poster || undefined} controls preload="metadata" playsInline aria-label={text(content.title, "Video invitație")} /> : <div className={cn("mx-auto mt-6 grid aspect-video max-w-3xl place-items-center bg-black/5", radiusClass(design.radius))}><Play className="size-10 opacity-35" aria-hidden /></div>}{text(content.caption) ? <p className="mx-auto mt-3 max-w-2xl text-xs leading-relaxed opacity-70">{edit("caption")}</p> : null}</section>;
    }
    if (blockKind === "media_text") {
      const image = resolveMedia(text(content.mediaId), text(content.url));
      const mediaRight = text(content.mediaPosition, "left") === "right";
      return <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}><div className={cn("mx-auto max-w-4xl items-center gap-7", styles.mediaTextGrid)}><InvitationImage src={image} alt={text(content.alt)} className={cn("aspect-[4/5]", radiusClass(design.radius), mediaRight && styles.mediaTextRightImage)} artDirection={advancedArtDirection} /><div className={cn("text-left", mediaRight && styles.mediaTextRightCopy)}><h2 className={cn(headingClass, styles.advancedHeading, styles.artDirected)} style={{ ...advancedArtStyle, ...sectionHeadingStyle(section, design) }}>{edit("title")}</h2><p className="mt-4 whitespace-pre-line text-sm leading-relaxed opacity-75">{edit("body")}</p><ExternalAction content={content} label={edit("buttonLabel")} className={cn("mt-6", buttonClass)} design={design} inverted={isInverted(section)} editorMode={editorMode} /></div></div></section>;
    }
  }

  return (
    <section id={sectionAnchor(section)} className={commonClass} style={commonStyle}>
      <GenericSectionBody section={section} design={design} headingClass={headingClass} edit={edit} />
      <ExternalAction content={content} label={edit("buttonLabel")} className={cn("mt-6", buttonClass)} design={design} inverted={isInverted(section)} editorMode={editorMode} />
    </section>
  );
}

function GenericSectionBody({
  section,
  design,
  headingClass,
  edit,
}: {
  section: InvitationSection;
  design: InvitationDesign;
  headingClass: string;
  edit: (key: string, fallback?: string) => React.ReactNode;
}) {
  const center = section.style.align === "center";
  const right = section.style.align === "right";
  return <><h2 className={cn("text-3xl", headingClass)} style={sectionHeadingStyle(section, design)}>{edit("title")}</h2><p className={cn("mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed opacity-75", center && "mx-auto", right && "ml-auto")}>{edit("body")}</p>{text(section.content.details) ? <p className={cn("mt-5 max-w-2xl whitespace-pre-line text-xs leading-relaxed opacity-70", center && "mx-auto", right && "ml-auto")}>{edit("details")}</p> : null}</>;
}

function SectionHeading({ section, design, className, children }: { section: InvitationSection; design: InvitationDesign; className: string; children: React.ReactNode }) {
  return <h2 className={cn("text-3xl", className)} style={sectionHeadingStyle(section, design)}>{children}</h2>;
}

function InvitationText({ value, onCommit, onFocus, label, contentKey, active = false, style, device = "desktop", canvasScale = 1, offsetX = 0, offsetY = 0, locked = false, onMove, onGuideChange }: { value: string; onCommit?: (value: string) => void; onFocus?: () => void; label: string; contentKey?: string; active?: boolean; style?: React.CSSProperties; device?: InvitationDevice; canvasScale?: number; offsetX?: number; offsetY?: number; locked?: boolean; onMove?: (position: { offsetX: number; offsetY: number }) => void; onGuideChange?: (guide: { x?: number; y?: number } | null) => void }) {
  if (!onCommit)
    return Object.keys(style ?? {}).length ? (
      <span className={styles.editableText} style={style}>{value}</span>
    ) : (
      <>{value}</>
    );
  return <EditableInvitationText value={value} onCommit={onCommit} onFocus={onFocus} label={label} contentKey={contentKey} active={active} style={style} device={device} canvasScale={canvasScale} offsetX={offsetX} offsetY={offsetY} locked={locked} onMove={onMove} onGuideChange={onGuideChange} />;
}

function EditableInvitationText({ value, onCommit, onFocus, label, contentKey, active, style, device, canvasScale, offsetX, offsetY, locked, onMove, onGuideChange }: { value: string; onCommit: (value: string) => void; onFocus?: () => void; label: string; contentKey?: string; active: boolean; style?: React.CSSProperties; device: InvitationDevice; canvasScale: number; offsetX: number; offsetY: number; locked: boolean; onMove?: (position: { offsetX: number; offsetY: number }) => void; onGuideChange?: (guide: { x?: number; y?: number } | null) => void }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [editing, setEditing] = React.useState(false);
  const dragRef = React.useRef<DragState | null>(null);

  React.useEffect(() => {
    if (!editing) return;
    const node = ref.current;
    if (!node) return;
    node.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing]);

  const stopDrag = (commit: boolean) => {
    const node = ref.current;
    const drag = dragRef.current;
    if (!node || !drag) return;
    dragRef.current = null;
    onGuideChange?.(null);
    if (commit && drag.moved) {
      onMove?.({ offsetX: drag.nextX, offsetY: drag.nextY });
      window.requestAnimationFrame(() => {
        if (ref.current) ref.current.style.transform = "";
      });
    } else {
      node.style.transform = "";
    }
  };

  return (
    <span
      ref={ref}
      className={cn(
        styles.editableText,
        styles.editorText,
        "min-w-4 whitespace-pre-wrap rounded-sm outline-none transition-[background-color,box-shadow]",
        editing ? "cursor-text" : locked ? "cursor-default" : "cursor-move",
        active && styles.editorTextSelected,
        active && !editing && !locked && "touch-none",
        locked && styles.editorTextLocked,
      )}
      style={style}
      contentEditable={editing ? "plaintext-only" : false}
      suppressContentEditableWarning
      role={editing ? "textbox" : "button"}
      tabIndex={0}
      aria-label={`${locked ? "Selectează" : "Mută sau editează"} ${lowercaseFirst(label)}`}
      aria-pressed={!editing ? active : undefined}
      title={
        locked
          ? `${label} este blocat. Deblochează-l din Straturi.`
          : "Trage pentru mutare. Dublu clic pentru editarea textului."
      }
      data-invitation-content-key={contentKey}
      data-invitation-content-label={label}
      data-invitation-content-selected={active ? "true" : undefined}
      data-invitation-content-locked={locked ? "true" : undefined}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onFocus?.();
        setEditing(true);
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (!dragRef.current?.moved) onFocus?.();
      }}
      onPointerDown={(event) => {
        if (editing || !onMove || locked || event.button !== 0) {
          onFocus?.();
          return;
        }
        if (event.pointerType === "touch" && !active) {
          onFocus?.();
          return;
        }
        const node = event.currentTarget;
        const section = node.closest<HTMLElement>("[data-invitation-section]");
        if (!section) return;
        event.preventDefault();
        event.stopPropagation();
        onFocus?.();
        node.setPointerCapture(event.pointerId);
        const elementRect = node.getBoundingClientRect();
        const sectionRect = section.getBoundingClientRect();
        const otherRects = Array.from(
          section.querySelectorAll<HTMLElement>("[data-invitation-content-key]"),
        )
          .filter((entry) => entry !== node && entry.offsetParent !== null)
          .map((entry) => entry.getBoundingClientRect());
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: offsetX,
          originY: offsetY,
          nextX: offsetX,
          nextY: offsetY,
          moved: false,
          elementRect,
          sectionRect,
          otherRects,
          scale: Math.max(0.25, canvasScale),
          device,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const rawDx = event.clientX - drag.startX;
        const rawDy = event.clientY - drag.startY;
        if (!drag.moved && Math.hypot(rawDx, rawDy) < 3) return;
        drag.moved = true;
        event.preventDefault();
        const snappedX = snapDragAxis(
          drag.elementRect.left,
          drag.elementRect.right,
          rawDx,
          [
            drag.sectionRect.left + 24 * drag.scale,
            drag.sectionRect.left + drag.sectionRect.width / 2,
            drag.sectionRect.right - 24 * drag.scale,
            ...drag.otherRects.flatMap((rect) => [
              rect.left,
              rect.left + rect.width / 2,
              rect.right,
            ]),
          ],
          event.pointerType === "touch" ? 10 : 6,
        );
        const snappedY = snapDragAxis(
          drag.elementRect.top,
          drag.elementRect.bottom,
          rawDy,
          [
            drag.sectionRect.top + 24 * drag.scale,
            drag.sectionRect.top + drag.sectionRect.height / 2,
            drag.sectionRect.bottom - 24 * drag.scale,
            ...drag.otherRects.flatMap((rect) => [
              rect.top,
              rect.top + rect.height / 2,
              rect.bottom,
            ]),
          ],
          event.pointerType === "touch" ? 10 : 6,
        );
        drag.nextX = Math.round(drag.originX + snappedX.delta / drag.scale);
        drag.nextY = Math.round(drag.originY + snappedY.delta / drag.scale);
        event.currentTarget.style.transform = `translate3d(${drag.nextX}px, ${drag.nextY}px, 0)`;
        onGuideChange?.({
          x:
            snappedX.target === undefined
              ? undefined
              : ((snappedX.target - drag.sectionRect.left) /
                  drag.sectionRect.width) *
                100,
          y:
            snappedY.target === undefined
              ? undefined
              : ((snappedY.target - drag.sectionRect.top) /
                  drag.sectionRect.height) *
                100,
        });
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        stopDrag(true);
      }}
      onPointerCancel={() => stopDrag(false)}
      onLostPointerCapture={() => {
        if (dragRef.current) stopDrag(true);
      }}
      onBlur={(event) => {
        if (!editing) return;
        const next = editableInvitationText(event.currentTarget);
        setEditing(false);
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(event) => {
        if (editing) {
          if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.textContent = value;
            event.currentTarget.blur();
          } else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.blur();
          }
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          setEditing(true);
          return;
        }
        if (
          !locked &&
          onMove &&
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          const step = event.shiftKey ? 10 : 1;
          onMove({
            offsetX:
              offsetX +
              (event.key === "ArrowLeft"
                ? -step
                : event.key === "ArrowRight"
                  ? step
                  : 0),
            offsetY:
              offsetY +
              (event.key === "ArrowUp"
                ? -step
                : event.key === "ArrowDown"
                  ? step
                  : 0),
          });
        }
      }}
    >
      {value}
    </span>
  );
}

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  nextX: number;
  nextY: number;
  moved: boolean;
  elementRect: DOMRect;
  sectionRect: DOMRect;
  otherRects: DOMRect[];
  scale: number;
  device: InvitationDevice;
};

function snapDragAxis(
  start: number,
  end: number,
  delta: number,
  targets: number[],
  distance: number,
) {
  const anchors = [start + delta, start + (end - start) / 2 + delta, end + delta];
  let best: { difference: number; target: number } | null = null;
  for (const anchor of anchors) {
    for (const target of targets) {
      const difference = target - anchor;
      if (
        Math.abs(difference) <= distance &&
        (!best || Math.abs(difference) < Math.abs(best.difference))
      )
        best = { difference, target };
    }
  }
  return best
    ? { delta: delta + best.difference, target: best.target }
    : { delta, target: undefined };
}

function EditorAlignmentGuides({ guide }: { guide: EditorGuide }) {
  return (
    <span className={styles.editorGuides} aria-hidden>
      {guide.x !== undefined ? (
        <span
          className={styles.editorGuideVertical}
          style={{ left: `${guide.x}%` }}
        />
      ) : null}
      {guide.y !== undefined ? (
        <span
          className={styles.editorGuideHorizontal}
          style={{ top: `${guide.y}%` }}
        />
      ) : null}
    </span>
  );
}

function editableInvitationText(element: HTMLElement) {
  return (element.textContent ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n+$/g, "");
}

function InvitationStructuredText({ value, label, contentKey, active, onActivate, style }: { value: string; label: string; contentKey: string; active: boolean; onActivate?: () => void; style?: React.CSSProperties }) {
  if (!onActivate)
    return Object.keys(style ?? {}).length ? (
      <span className={styles.editableText} style={style}>{value}</span>
    ) : (
      <>{value}</>
    );
  return <span role="button" tabIndex={0} aria-label={`Editează ${lowercaseFirst(label)} în inspector`} title={`Editează ${lowercaseFirst(label)} în inspector`} data-invitation-content-key={contentKey} className={cn(styles.editableText, "inline-block cursor-pointer rounded-sm outline-none transition-[background-color,box-shadow] hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-current/40", active && "bg-white/15 ring-2 ring-current/40")} style={style} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onActivate(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onActivate(); } }}>{value}</span>;
}

function lowercaseFirst(value: string) {
  return value ? `${value[0].toLocaleLowerCase("ro-RO")}${value.slice(1)}` : value;
}

type InvitationEditableTextStyle = {
  fontSize?: number;
  letterSpacing?: number;
  lineHeight?: number;
  offsetX?: number;
  offsetY?: number;
  width?: number;
  align?: "left" | "center" | "right";
  hidden?: boolean;
  zIndex?: number;
};

function invitationEditableTextStyle(
  content: Record<string, unknown>,
  key: string,
): React.CSSProperties {
  const stylesValue = content.textStyles;
  if (!stylesValue || typeof stylesValue !== "object") return {};
  const entry = (stylesValue as Record<string, unknown>)[key];
  if (!entry || typeof entry !== "object") return {};
  const variables: Record<string, string | number> = {};
  const write = (scope: "all" | "desktop" | "tablet" | "mobile") => {
    const value = (entry as Record<string, unknown>)[scope];
    if (!value || typeof value !== "object") return;
    const style = value as InvitationEditableTextStyle;
    const suffix = scope === "all" ? "all" : scope;
    if (typeof style.fontSize === "number")
      variables[`--editable-font-size-${suffix}`] = `${style.fontSize}px`;
    if (typeof style.letterSpacing === "number")
      variables[`--editable-letter-spacing-${suffix}`] = `${style.letterSpacing}px`;
    if (typeof style.lineHeight === "number")
      variables[`--editable-line-height-${suffix}`] = style.lineHeight;
    if (typeof style.offsetX === "number")
      variables[`--editable-offset-x-${suffix}`] = `${style.offsetX}px`;
    if (typeof style.offsetY === "number")
      variables[`--editable-offset-y-${suffix}`] = `${style.offsetY}px`;
    if (typeof style.width === "number")
      variables[`--editable-width-${suffix}`] = `${style.width}%`;
    if (style.align)
      variables[`--editable-align-${suffix}`] = style.align;
    if (typeof style.zIndex === "number")
      variables[`--editable-z-index-${suffix}`] = style.zIndex;
    if (typeof style.hidden === "boolean")
      variables[`--editable-display-${suffix}`] = style.hidden
        ? "none"
        : "inline-block";
  };
  write("all");
  write("desktop");
  write("tablet");
  write("mobile");
  return variables as React.CSSProperties;
}

function invitationTextLabel(type: InvitationSection["type"], key: string) {
  if (type === "hero") {
    return ({
      eyebrow: "supratitlul",
      names: "numele sau titlul principal",
      date: "data",
      venue: "orașul sau locația",
      title: "mesajul principal",
      subtitle: "introducerea",
    } as Record<string, string>)[key] ?? "textul copertei";
  }
  return key === "title" ? "titlul secțiunii" : "textul secțiunii";
}

function InvitationCountdown({
  date,
  center,
  headingClass,
  accent,
}: {
  date: string;
  center: boolean;
  headingClass: string;
  accent: string;
}) {
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    const target = new Date(date).getTime();
    if (!Number.isFinite(target)) return;

    let interval: number | null = null;
    let animationFrame = 0;
    const update = () => {
      const current = Date.now();
      setNow(current);
      if (current >= target && interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    };
    animationFrame = window.requestAnimationFrame(update);
    if (Date.now() < target) interval = window.setInterval(update, 1_000);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (interval !== null) window.clearInterval(interval);
    };
  }, [date]);

  const values =
    now === null ? countdownPlaceholderValues() : countdownValuesAt(date, now);
  return (
    <div
      className={cn("mt-7 grid grid-cols-4", center && "mx-auto max-w-xl")}
      role="timer"
      aria-label="Timp rămas până la eveniment"
    >
      {values.map(([value, label]) => (
        <div
          key={label}
          className="border-l border-current/15 px-1.5 first:border-l-0"
        >
          <p
            className={cn("tabular-nums", headingClass, styles.countdownValue)}
            style={{ color: accent }}
          >
            {value}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide opacity-70">
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}

function RsvpAction({ label, className, design, inverted, onRsvp, href, editorMode = false }: { label: React.ReactNode; className: string; design: InvitationDesign; inverted: boolean; onRsvp?: () => void; href?: string; editorMode?: boolean }) {
  const style = invitationButtonStyle(design, inverted);
  if (editorMode) return <span className={className} style={style}>{label}</span>;
  if (href) return <a href={href} className={className} style={style}>{label}</a>;
  if (onRsvp) return <button type="button" onClick={onRsvp} className={className} style={style}>{label}</button>;
  return <a href="#confirmare-invitatie" className={className} style={style}>{label}</a>;
}

function ExternalAction({ content, label, className, design, inverted, editorMode = false }: { content: Record<string, unknown>; label?: React.ReactNode; className: string; design: InvitationDesign; inverted: boolean; editorMode?: boolean }) {
  const labelText = text(content.buttonLabel);
  const url = safeLink(text(content.url));
  if (!labelText || !url) return null;
  if (editorMode) return <span className={className} style={invitationButtonStyle(design, inverted)}>{label ?? labelText}<ExternalLink className="ml-2 size-3.5" aria-hidden /></span>;
  return <a href={url} target="_blank" rel="noreferrer" className={className} style={invitationButtonStyle(design, inverted)}>{label ?? labelText}<ExternalLink className="ml-2 size-3.5" aria-hidden /></a>;
}

function InvitationImage({ src, alt, className, focalX = 50, focalY = 50, artDirection }: { src: string; alt: string; className?: string; focalX?: number; focalY?: number; artDirection?: InvitationArtDirection }) {
  if (!src) return <div className={cn("grid place-items-center bg-black/5", className)}><Images className="size-7 opacity-30" aria-hidden /><span className="sr-only">Imagine indisponibilă</span></div>;
  // Invitation media is served either by the authenticated media route or by
  // a user-provided remote URL, so a native img avoids an unsafe wildcard in
  // Next image configuration while retaining object-position controls.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={1440} height={900} className={cn("size-full object-cover", artDirection && styles.artDirectedImage, className)} style={artDirection ? invitationArtDirectionStyle(artDirection) : { objectPosition: `${focalX}% ${focalY}%` }} loading="lazy" decoding="async" />;
}

function heroCopyStyle(content: Record<string, unknown>): React.CSSProperties {
  const style: Record<string, string> = {};
  const setPixels = (property: string, value: unknown, min: number, max: number) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    style[property] = `${Math.min(max, Math.max(min, value))}px`;
  };
  const setUnitless = (
    property: string,
    value: unknown,
    min: number,
    max: number,
    divisor = 1,
  ) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    style[property] = String(Math.min(max, Math.max(min, value)) / divisor);
  };

  setPixels("--hero-copy-width", content.textWidth, 280, 960);
  setPixels("--hero-copy-offset-x", content.textOffsetX, -240, 240);
  setPixels("--hero-copy-offset-y", content.textOffsetY, -200, 200);
  setPixels("--hero-names-gap", content.namesGap, 0, 120);
  setPixels("--hero-meta-gap", content.metaGap, 0, 120);
  setPixels("--hero-title-gap", content.titleGap, 0, 120);
  setPixels("--hero-subtitle-gap", content.subtitleGap, 0, 80);
  setPixels("--hero-actions-gap", content.actionsGap, 0, 100);
  setPixels("--hero-name-tracking", content.namesLetterSpacing, -8, 8);
  setUnitless("--hero-name-line-height", content.namesLineHeight, 70, 140, 100);

  return style as React.CSSProperties;
}

type InvitationArtDirectionValue = {
  focalX: number;
  focalY: number;
  headingScale: number;
  hideDecorations: boolean;
};

type InvitationArtDirection = {
  desktop: InvitationArtDirectionValue;
  tablet: InvitationArtDirectionValue;
  mobile: InvitationArtDirectionValue;
};

function invitationArtDirection(content: Record<string, unknown>): InvitationArtDirection {
  const raw = record(content.artDirection);
  const fallbackX = clampNumber(content.focalX, 0, 100, 50);
  const fallbackY = clampNumber(content.focalY, 0, 100, 50);
  const parse = (device: "desktop" | "tablet" | "mobile", fallbackScale: number) => {
    const value = record(raw[device]);
    return {
      focalX: clampNumber(value.focalX, 0, 100, fallbackX),
      focalY: clampNumber(value.focalY, 0, 100, fallbackY),
      headingScale: clampNumber(value.headingScale, 70, 130, fallbackScale),
      hideDecorations: value.hideDecorations === true,
    };
  };
  return {
    desktop: parse("desktop", 100),
    tablet: parse("tablet", 94),
    mobile: parse("mobile", 82),
  };
}

function invitationArtDirectionStyle(
  artDirection: InvitationArtDirection,
  headingMax = 96,
): React.CSSProperties {
  return {
    "--invitation-focal-desktop": `${artDirection.desktop.focalX}% ${artDirection.desktop.focalY}%`,
    "--invitation-focal-tablet": `${artDirection.tablet.focalX}% ${artDirection.tablet.focalY}%`,
    "--invitation-focal-mobile": `${artDirection.mobile.focalX}% ${artDirection.mobile.focalY}%`,
    "--invitation-heading-desktop": artDirection.desktop.headingScale / 100,
    "--invitation-heading-tablet": artDirection.tablet.headingScale / 100,
    "--invitation-heading-mobile": artDirection.mobile.headingScale / 100,
    "--invitation-heading-max": `${headingMax}px`,
  } as React.CSSProperties;
}

function InvitationDecorations({
  section,
  resolveMedia,
  artDirection,
}: {
  section: InvitationSection;
  resolveMedia: InvitationMediaResolver;
  artDirection: InvitationArtDirection;
}) {
  const layers = array(section.content.decorations);
  if (!layers.length) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        styles.decorationLayer,
      )}
      aria-hidden="true"
    >
      {layers.flatMap((layer, index) => {
        const kind = text(layer.kind);
        const devices = stringArray(layer.visibleOn);
        const visibleDevices = (devices.length
          ? devices
          : ["desktop", "tablet", "mobile"]
        ).filter(
          (device) =>
            (device === "desktop" ||
              device === "tablet" ||
              device === "mobile") &&
            !artDirection[device].hideDecorations,
        );
        if (layer.hidden === true) return [];
        const layerStyle: React.CSSProperties = {
          left: `${clampNumber(layer.x, 4, 96, 50)}%`,
          top: `${clampNumber(layer.y, 4, 96, 50)}%`,
          width: `${clampNumber(layer.scale, 25, 200, 100) * 0.96}px`,
          opacity: clampNumber(layer.opacity, 0, 100, 100) / 100,
          zIndex: clampNumber(layer.zIndex, 0, 60, index + 1),
          transform: `translate(-50%, -50%) rotate(${clampNumber(layer.rotation, -180, 180, 0)}deg)`,
        };
        const color = validColor(text(layer.color, "#FFFFFF"));
        return visibleDevices.map((device) => {
          const layerClass = cn(
            "absolute block max-w-[42cqi] select-none",
            device === "desktop" && styles.decorationDesktop,
            device === "tablet" && styles.decorationTablet,
            device === "mobile" && styles.decorationMobile,
          );
          const key = `${text(layer.id, String(index))}-${device}`;
          if (kind === "image") {
            const source = resolveMedia(text(layer.mediaId), text(layer.url));
            return source ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={key}
                src={source}
                alt=""
                width={320}
                height={320}
                className={cn(layerClass, "h-auto object-contain")}
                style={layerStyle}
                loading="lazy"
                decoding="async"
              />
            ) : null;
          }
          if (kind === "monogram") {
            return (
              <span
                key={key}
                className={cn(
                  layerClass,
                  "font-display text-[clamp(2rem,8cqi,5rem)] font-semibold leading-none",
                )}
                style={{ ...layerStyle, color }}
              >
                {text(layer.text, text(layer.label))}
              </span>
            );
          }
          return (
            <span
              key={key}
              className={cn(layerClass, "aspect-square rounded-full border")}
              style={{
                ...layerStyle,
                borderColor: colorWithAlpha(color, 34),
                backgroundColor: colorWithAlpha(color, 10),
              }}
            />
          );
        });
      })}
    </div>
  );
}

function MediaPlaceholder({ radius }: { radius: InvitationDesign["radius"] }) {
  return <div className={cn("mt-8 grid min-h-40 place-items-center border border-dashed border-current/25 p-6", radiusClass(radius))}><div><Images className="mx-auto size-6 opacity-35" aria-hidden /><p className="mt-2 text-xs opacity-60">Adaugă fotografii din inspector</p></div></div>;
}

function invitationButtonClass(design: InvitationDesign) {
  return cn(
    "inline-flex min-h-11 items-center justify-center px-5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2",
    design.buttonStyle === "pill" ? "rounded-full" : buttonRadiusClass(design),
    design.buttonStyle === "outline" && "border border-current bg-transparent",
  );
}

function invitationButtonStyle(design: InvitationDesign, inverted: boolean): React.CSSProperties | undefined {
  if (design.buttonStyle === "outline")
    return { color: inverted ? "#FFFFFF" : design.accent };
  const backgroundColor = inverted ? "#FFFFFF" : design.accent;
  const requestedColor = inverted ? design.accent : "#FFFFFF";
  return {
    backgroundColor,
    color: ensureReadableTextColor(backgroundColor, requestedColor),
  };
}

function sectionTone(section: InvitationSection, design: InvitationDesign, resolveMedia: InvitationMediaResolver): React.CSSProperties {
  const style = section.style;
  if (style.backgroundMode === "gradient") {
    const gradientFrom = validColor(style.gradientFrom);
    const gradientTo = validColor(style.gradientTo);
    return {
      background: `linear-gradient(${clampNumber(style.gradientAngle, 0, 360, 135)}deg, ${gradientFrom}, ${gradientTo})`,
      color: readableTextAcrossBackgrounds(
        [gradientFrom, gradientTo],
        style.textColor || design.text,
      ),
    };
  }
  if (style.backgroundMode === "image") {
    const background = resolveMedia(text(section.content.backgroundMediaId, text(section.content.mediaId)), text(section.content.backgroundImage, text(section.content.coverImage)));
    if (background) return { backgroundColor: validColor(style.backgroundColor || design.text), backgroundImage: `linear-gradient(${colorWithAlpha(text(section.content.backgroundOverlayColor, "#19151D"), clampNumber(section.content.backgroundOverlayOpacity, 0, 100, 42))},${colorWithAlpha(text(section.content.backgroundOverlayColor, "#19151D"), clampNumber(section.content.backgroundOverlayOpacity, 0, 100, 42))}),url("${cssUrl(background)}")`, backgroundPosition: `${clampNumber(section.content.focalX, 0, 100, 50)}% ${clampNumber(section.content.focalY, 0, 100, 50)}%`, backgroundSize: "cover", color: validColor(style.textColor || "#FFFFFF") };
  }
  if (style.tone === "custom") {
    const backgroundColor = validColor(style.backgroundColor || design.surface);
    return {
      backgroundColor,
      color: ensureReadableTextColor(
        backgroundColor,
        validColor(style.textColor || design.text),
      ),
    };
  }
  if (style.tone === "soft") {
    const backgroundColor = mixHex(design.accent, design.surface, 0.08);
    return {
      backgroundColor,
      color: ensureReadableTextColor(backgroundColor, validColor(design.text)),
    };
  }
  if (style.tone === "accent") {
    const backgroundColor = validColor(design.accent);
    return {
      backgroundColor,
      color: ensureReadableTextColor(backgroundColor, "#FFFFFF"),
    };
  }
  if (style.tone === "dark") {
    const backgroundColor = validColor(design.text);
    return {
      backgroundColor,
      color: ensureReadableTextColor(
        backgroundColor,
        validColor(design.surface),
      ),
    };
  }
  if (design.template === "nocturne") {
    if (section.type === "countdown")
      return { backgroundColor: "#251629", color: "#FFF8EE" };
    if (section.type === "locations")
      return { backgroundColor: "#F1DCCB", color: "#251629" };
    if (section.type === "rsvp")
      return {
        backgroundColor: validColor(design.accent),
        color: ensureReadableTextColor(
          validColor(design.accent),
          "#251629",
        ),
      };
    if (
      section.type === "dress_code" ||
      section.type === "faq" ||
      section.type === "contact"
    )
      return { backgroundColor: "#3B183F", color: "#FFF8EE" };
  }
  const backgroundColor = validColor(design.surface);
  return {
    backgroundColor,
    color: ensureReadableTextColor(backgroundColor, validColor(design.text)),
  };
}

function sectionHeadingStyle(section: InvitationSection, design: InvitationDesign): React.CSSProperties | undefined {
  if (isInverted(section) || section.style.backgroundMode === "image")
    return undefined;
  if (section.style.backgroundMode === "gradient")
    return {
      color: readableTextAcrossBackgrounds(
        [
          validColor(section.style.gradientFrom),
          validColor(section.style.gradientTo),
        ],
        design.accent,
        3,
      ),
    };
  const backgroundColor =
    section.style.tone === "custom"
      ? validColor(section.style.backgroundColor || design.surface)
      : section.style.tone === "soft"
        ? mixHex(design.accent, design.surface, 0.08)
        : design.template === "nocturne" && section.type === "countdown"
          ? "#251629"
          : design.template === "nocturne" && section.type === "locations"
            ? "#F1DCCB"
            : design.template === "nocturne" &&
                (section.type === "dress_code" ||
                  section.type === "faq" ||
                  section.type === "contact")
              ? "#3B183F"
              : validColor(design.surface);
  return {
    color: ensureReadableTextColor(
      backgroundColor,
      validColor(design.accent),
      3,
    ),
  };
}

function isInverted(section: InvitationSection) {
  return section.style.tone === "accent" || section.style.tone === "dark" || section.style.backgroundMode === "image";
}

function sectionPadding(padding: number, spacing: InvitationDesign["spacing"]) {
  const factor = spacing === "compact" ? 0.78 : spacing === "airy" ? 1.22 : 1;
  return Math.round(clampNumber(padding, 24, 120, 48) * factor);
}

function sectionAnchor(section: InvitationSection) {
  return `invitatie-${section.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function radiusClass(radius: InvitationDesign["radius"]) {
  return radius === "none" ? "rounded-none" : radius === "round" ? "rounded-2xl" : "rounded-xl";
}

function buttonRadiusClass(design: InvitationDesign) {
  return design.radius === "none" ? "rounded-none" : design.radius === "round" ? "rounded-xl" : "rounded-lg";
}

function colorWithAlpha(value: string, opacity: number) {
  return `${validColor(value)}${Math.round(clampNumber(opacity, 0, 100, 0) * 2.55).toString(16).padStart(2, "0")}`;
}

function contentYClass(value: string) {
  return value === "top" ? "items-start" : value === "center" ? "items-center" : "items-end";
}

function safeLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

const connectedIsoDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/i;

export function invitationDisplayTime(value: string) {
  const normalized = value.trim();
  if (!connectedIsoDateTimePattern.test(normalized)) return value;
  return normalized.slice(11, 16);
}

export function invitationDisplayDeadline(value: string, timeZone?: string) {
  const normalized = value.trim();
  if (!connectedIsoDateTimePattern.test(normalized)) return value;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return value;

  const format = (zone: string) =>
    new Intl.DateTimeFormat("ro-RO", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: zone,
    }).format(date);

  try {
    return format(timeZone || "UTC");
  } catch {
    return format("UTC");
  }
}

function invitationTimeZone(sections: InvitationSection[]) {
  for (const section of sections) {
    if (section.type !== "schedule") continue;
    for (const item of array(section.content.items)) {
      const timeZone = text(item.timezone).trim();
      if (timeZone) return timeZone;
    }
  }
  return undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cssUrl(value: string) {
  return value.replace(/["\\\n\r]/g, (character) => encodeURIComponent(character));
}

function validColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#20211F";
}

function readableTextAcrossBackgrounds(
  backgrounds: string[],
  requested: string,
  minimumRatio = 4.5,
) {
  const candidates = [
    validColor(requested),
    "#19151D",
    "#FFF9FF",
    "#000000",
    "#FFFFFF",
  ];
  const ranked = candidates
    .map((color) => ({
      color,
      ratio: Math.min(
        ...backgrounds.map((background) =>
          contrastRatio(color, validColor(background)),
        ),
      ),
    }))
    .sort((left, right) => right.ratio - left.ratio);
  const requestedResult = ranked.find(
    (candidate) => candidate.color.toLowerCase() === validColor(requested).toLowerCase(),
  );
  return (requestedResult?.ratio ?? 0) >= minimumRatio
    ? requestedResult?.color ?? validColor(requested)
    : ranked[0]?.color ?? "#19151D";
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function countdownValuesAt(value: string, now: number): Array<[string, string]> {
  const target = new Date(value).getTime();
  if (!Number.isFinite(target) || !Number.isFinite(now))
    return countdownPlaceholderValues();
  const difference = Math.max(0, target - now);
  return [[String(Math.floor(difference / 86_400_000)).padStart(2, "0"), "zile"], [String(Math.floor((difference / 3_600_000) % 24)).padStart(2, "0"), "ore"], [String(Math.floor((difference / 60_000) % 60)).padStart(2, "0"), "minute"], [String(Math.floor((difference / 1_000) % 60)).padStart(2, "0"), "secunde"]];
}

function countdownPlaceholderValues(): Array<[string, string]> {
  return [
    ["N/A", "zile"],
    ["N/A", "ore"],
    ["N/A", "minute"],
    ["N/A", "secunde"],
  ];
}

function mixHex(a: string, b: string, amount: number) {
  const parse = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(validColor(hex).slice(index, index + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const mix = (left: number, right: number) => Math.round(left * amount + right * (1 - amount)).toString(16).padStart(2, "0");
  return `#${mix(ar, br)}${mix(ag, bg)}${mix(ab, bb)}`;
}
