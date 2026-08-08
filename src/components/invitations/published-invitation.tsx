"use client";

import { BedDouble, CalendarPlus, Images, MapPin, Shirt } from "lucide-react";
import {
  array,
  snapshotFromPersisted,
  stringArray,
  text,
  type InvitationDesign,
  type InvitationSection,
} from "@/lib/invitations/editor-model";
import { cn } from "@/lib/utils";

export function PublishedInvitation({
  invitation,
  token,
  onAddCalendar,
}: {
  invitation: Record<string, unknown>;
  token: string;
  onAddCalendar: () => void;
}) {
  const document = record(invitation.document);
  const snapshot = snapshotFromPersisted(
    Array.isArray(document.sections)
      ? (document.sections as Parameters<typeof snapshotFromPersisted>[0])
      : undefined,
    record(invitation.settings) as Parameters<typeof snapshotFromPersisted>[1],
  );
  const { design } = snapshot;
  return (
    <article
      className={cn(
        "overflow-hidden border border-black/10 shadow-[0_20px_60px_rgba(45,40,32,.12)]",
        radiusClass(design.radius),
      )}
      style={{ backgroundColor: design.background, color: design.text }}
    >
      {snapshot.sections
        .filter((section) => section.visible)
        .map((section) => (
          <PublishedSection
            key={section.id}
            section={section}
            design={design}
            resolveMedia={(mediaId, externalUrl = "") =>
              mediaId
                ? `/api/v1/guest/invitation-media/${encodeURIComponent(mediaId)}?token=${encodeURIComponent(token)}`
                : safeImageUrl(externalUrl)
            }
            onAddCalendar={onAddCalendar}
          />
        ))}
    </article>
  );
}

function PublishedSection({
  section,
  design,
  resolveMedia,
  onAddCalendar,
}: {
  section: InvitationSection;
  design: InvitationDesign;
  resolveMedia: (mediaId: string, externalUrl?: string) => string;
  onAddCalendar: () => void;
}) {
  const content = section.content;
  const center = section.style.align === "center";
  const right = section.style.align === "right";
  const heading = design.headingFont === "display" ? "font-display font-semibold" : "font-sans font-semibold tracking-tight";
  const padding = design.spacing === "compact" ? "py-8 sm:py-10" : design.spacing === "airy" ? "py-14 sm:py-20" : "py-11 sm:py-14";
  const common = cn("px-6 sm:px-10", padding, center ? "text-center" : right ? "text-right" : "text-left");
  const tone = sectionTone(section.style, design);
  const sectionStyle = { ...tone, paddingBlock: section.style.padding };
  if (section.type === "hero") {
    const image = resolveMedia(text(content.mediaId), text(content.coverImage));
    const layout = text(content.layout, "immersive");
    const textBlock = <div className={cn("w-full", image && layout === "immersive" && "text-white")}>
      <p className="text-[10px] font-semibold uppercase tracking-[.34em] opacity-70">{text(content.eyebrow)}</p>
      <h1 className={cn("mt-4 leading-[.94]", heading)} style={{ fontSize: Math.min(96, Math.max(38, Number(content.headingSize) || 76)), ...(!image || layout !== "immersive" ? { color: design.accent } : {}) }}>{text(content.names)}</h1>
      <p className="mt-6 text-sm">{text(content.date)} · {text(content.venue)}</p>
      <h2 className={cn("mt-8 text-xl sm:text-2xl", heading)}>{text(content.title)}</h2>
      <p className={cn("mt-3 max-w-xl text-sm leading-relaxed opacity-75", center && "mx-auto", right && "ml-auto")}>{text(content.subtitle)}</p>
      <div className={cn("mt-7 flex flex-wrap gap-2", center && "justify-center", right && "justify-end")}>
        <a href="#confirmare-rsvp" className={cn("inline-flex min-h-10 items-center px-5 text-xs font-semibold", radiusClass(design.radius))} style={{ backgroundColor: image && layout === "immersive" ? "#fff" : design.accent, color: image && layout === "immersive" ? design.accent : "#fff" }}>{text(content.buttonLabel, "Confirmă prezența")}</a>
        <button onClick={onAddCalendar} className={cn("inline-flex min-h-10 cursor-pointer items-center gap-2 border border-current/25 px-5 text-xs font-semibold", radiusClass(design.radius))}><CalendarPlus className="size-4" />Calendar</button>
      </div>
    </div>;
    if (layout === "split")
      return <section className="grid min-h-[520px] overflow-hidden sm:grid-cols-2" style={tone}><div className={cn("flex px-8 py-16 sm:px-10", contentYClass(text(content.contentY, "center")))}>{textBlock}</div><div className="min-h-72 bg-black/5 bg-cover" style={{ backgroundImage: image ? `url("${image}")` : undefined, backgroundPosition: `${Number(content.focalX) || 50}% ${Number(content.focalY) || 50}%` }} /></section>;
    if (layout === "minimal")
      return <section className={common} style={{ ...sectionStyle, minHeight: Number(content.heroHeight) || 620 }}><div className="mx-auto max-w-2xl">{textBlock}</div>{image && <div className={cn("mt-10 aspect-[16/7] bg-cover", radiusClass(design.radius))} style={{ backgroundImage: `url("${image}")`, backgroundPosition: `${Number(content.focalX) || 50}% ${Number(content.focalY) || 50}%` }} />}</section>;
    return (
      <section
        className={cn(common, "flex overflow-hidden", contentYClass(text(content.contentY, "bottom")))}
        style={{
          ...sectionStyle,
          minHeight: Number(content.heroHeight) || 620,
          backgroundImage: image
            ? `linear-gradient(${colorWithAlpha(text(content.overlayColor, "#14251D"), Number(content.overlayOpacity) || 0)},${colorWithAlpha(text(content.overlayColor, "#14251D"), Number(content.overlayOpacity) || 0)}),url("${image}")`
            : undefined,
          backgroundPosition: `${Number(content.focalX) || 50}% ${Number(content.focalY) || 50}%`,
          backgroundSize: "cover",
        }}
      >
        {textBlock}
      </section>
    );
  }
  if (section.type === "story") return <section className={common} style={sectionStyle}><p className="text-[10px] font-semibold uppercase tracking-[.3em] opacity-50">Despre noi</p><h2 className={cn("mt-3 text-3xl sm:text-4xl", heading)} style={{ color: design.accent }}>{text(content.title)}</h2><p className={cn("mt-5 max-w-2xl text-sm leading-7 opacity-75", center && "mx-auto")}>{text(content.body)}</p>{text(content.quote) && <blockquote className={cn("mt-7 max-w-xl text-lg italic leading-relaxed opacity-80", center ? "mx-auto border-y border-current/20 py-5" : "border-l border-current/20 pl-5")}>{text(content.quote)}</blockquote>}</section>;
  if (section.type === "countdown") {
    const values = countdownValues(text(content.date));
    return <section className={common} style={sectionStyle}><h2 className={cn("text-2xl sm:text-3xl", heading)}>{text(content.title)}</h2><div className={cn("mt-7 grid grid-cols-4", center && "mx-auto max-w-xl")}>{values.map(([value, label]) => <div key={label} className="border-l border-current/15 px-2 first:border-l-0"><p className={cn("text-2xl tabular-nums sm:text-4xl", heading)} style={{ color: design.accent }}>{value}</p><p className="mt-1 text-[9px] uppercase tracking-wider opacity-55">{label}</p></div>)}</div></section>;
  }
  if (section.type === "schedule") return <section className={common} style={sectionStyle}><h2 className={cn("text-3xl", heading)} style={{ color: design.accent }}>{text(content.title)}</h2><div className={cn("mt-8", center && "mx-auto max-w-xl")}>{array(content.items).map((item, index) => <div key={index} className="grid grid-cols-[62px_1fr] gap-4 border-t border-current/15 py-4 first:border-t-0"><p className="text-sm font-semibold tabular-nums" style={{ color: design.accent }}>{text(item.time)}</p><div><p className="text-sm font-semibold">{text(item.title)}</p><p className="mt-1 text-xs opacity-60">{text(item.detail)}</p></div></div>)}</div></section>;
  if (section.type === "locations") return <section className={common} style={sectionStyle}><h2 className={cn("text-3xl", heading)} style={{ color: design.accent }}>{text(content.title)}</h2><div className={cn("mt-8 grid gap-3 sm:grid-cols-2", center && "mx-auto max-w-2xl")}>{array(content.items).map((item, index) => <a key={index} href={safeLink(text(item.url)) || undefined} target={safeLink(text(item.url)) ? "_blank" : undefined} rel="noreferrer" className={cn("border border-current/15 p-5", radiusClass(design.radius))}><MapPin className={cn("size-5", center && "mx-auto")} style={{ color: design.accent }} /><p className="mt-4 text-sm font-semibold">{text(item.name)}</p><p className="mt-1 text-xs leading-relaxed opacity-60">{text(item.address)}</p></a>)}</div></section>;
  if (section.type === "rsvp") return <section className={common} style={sectionStyle}><p className="text-[10px] font-semibold uppercase tracking-[.3em] opacity-60">RSVP</p><h2 className={cn("mt-3 text-3xl sm:text-4xl", heading)}>{text(content.title)}</h2><p className={cn("mt-4 max-w-xl text-sm opacity-70", center && "mx-auto")}>{text(content.body)}</p><p className="mt-3 text-xs font-semibold opacity-70">Până pe {text(content.deadline)}</p><a href="#confirmare-rsvp" className={cn("mt-7 inline-flex min-h-10 items-center px-5 text-xs font-semibold", radiusClass(design.radius))} style={{ backgroundColor: section.style.tone === "accent" || section.style.tone === "dark" ? "#fff" : design.accent, color: section.style.tone === "accent" || section.style.tone === "dark" ? design.accent : "#fff" }}>{text(content.buttonLabel, "Confirmă prezența")}</a></section>;
  if (section.type === "dress_code") return <section className={common} style={sectionStyle}><Shirt className={cn("size-5 opacity-60", center && "mx-auto")} /><h2 className={cn("mt-4 text-3xl", heading)}>{text(content.title)}</h2><p className={cn("mt-3 max-w-xl text-sm opacity-65", center && "mx-auto")}>{text(content.body)}</p><div className={cn("mt-6 flex flex-wrap gap-2", center && "justify-center")}>{stringArray(content.colors).map((color, index) => <span key={`${color}-${index}`} className="size-8 rounded-full border border-black/10" style={{ backgroundColor: color }} />)}</div></section>;
  if (section.type === "gallery") {
    const items = array(content.items);
    const layout = text(content.layout, "mosaic");
    return <section className={common} style={sectionStyle}><h2 className={cn("text-3xl", heading)} style={{ color: design.accent }}>{text(content.title)}</h2><p className={cn("mt-3 max-w-xl text-sm opacity-65", center && "mx-auto")}>{text(content.body)}</p>{items.length ? <div className={cn("mt-8 gap-2", layout === "filmstrip" ? "flex snap-x overflow-hidden" : "grid grid-cols-2 sm:grid-cols-3", center && layout !== "filmstrip" && "mx-auto max-w-2xl")}>{items.map((item, index) => { const image = resolveMedia(text(item.mediaId), text(item.url)); return <figure key={index} className={cn("overflow-hidden bg-black/5", radiusClass(design.radius), layout === "mosaic" && index === 0 && items.length > 2 && "col-span-2 row-span-2", layout === "filmstrip" && "w-[72%] shrink-0 snap-center")}><div className="aspect-square bg-cover bg-center" style={{ backgroundImage: image ? `url("${image}")` : undefined }}><span className={cn("grid size-full place-items-center", image ? "sr-only" : "text-xs opacity-45")}><Images className="size-6" /></span></div>{text(item.caption) && <figcaption className="px-3 py-2 text-[10px] opacity-60">{text(item.caption)}</figcaption>}</figure>})}</div> : null}</section>;
  }
  if (section.type === "faq") return <section className={common} style={sectionStyle}><h2 className={cn("text-3xl", heading)} style={{ color: design.accent }}>{text(content.title)}</h2><div className={cn("mt-7 divide-y divide-current/15 border-y border-current/15", center && "mx-auto max-w-2xl")}>{array(content.items).map((item, index) => <details key={index} className="group py-4"><summary className="cursor-pointer list-none text-sm font-semibold">{text(item.question)}</summary><p className="mt-2 text-xs leading-relaxed opacity-65">{text(item.answer)}</p></details>)}</div></section>;
  if (section.type === "accommodation") return <section className={common} style={sectionStyle}><BedDouble className={cn("size-5 opacity-60", center && "mx-auto")} /><h2 className={cn("mt-4 text-3xl", heading)}>{text(content.title)}</h2><p className={cn("mt-3 max-w-xl text-sm opacity-65", center && "mx-auto")}>{text(content.body)}</p></section>;
  return <section className={common} style={sectionStyle}><h2 className={cn("text-3xl", heading)} style={{ color: section.style.tone === "plain" || section.style.tone === "soft" ? design.accent : undefined }}>{text(content.title)}</h2><p className={cn("mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed opacity-70", center && "mx-auto")}>{text(content.body)}</p>{text(content.details) && <p className={cn("mt-4 max-w-2xl whitespace-pre-line text-xs opacity-60", center && "mx-auto")}>{text(content.details)}</p>}{text(content.name) && <p className="mt-5 text-sm font-semibold">{text(content.name)} · {text(content.phone)}</p>}</section>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sectionTone(style: InvitationSection["style"], design: InvitationDesign): React.CSSProperties {
  if (style.backgroundMode === "gradient")
    return { background: `linear-gradient(${style.gradientAngle}deg, ${validColor(style.gradientFrom)}, ${validColor(style.gradientTo)})`, color: style.textColor || design.text };
  if (style.tone === "custom")
    return { backgroundColor: validColor(style.backgroundColor || design.surface), color: validColor(style.textColor || design.text) };
  if (style.tone === "soft") return { backgroundColor: mixHex(design.accent, design.surface, 0.08), color: design.text };
  if (style.tone === "accent") return { backgroundColor: design.accent, color: "#FFFFFF" };
  if (style.tone === "dark") return { backgroundColor: design.text, color: design.surface };
  return { backgroundColor: design.surface, color: design.text };
}

function validColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#20211F";
}

function colorWithAlpha(value: string, opacity: number) {
  const alpha = Math.round(Math.min(100, Math.max(0, opacity)) * 2.55).toString(16).padStart(2, "0");
  return `${validColor(value)}${alpha}`;
}

function contentYClass(value: string) {
  return value === "top" ? "items-start" : value === "center" ? "items-center" : "items-end";
}

function radiusClass(radius: InvitationDesign["radius"]) {
  return radius === "none" ? "rounded-none" : radius === "round" ? "rounded-3xl" : "rounded-xl";
}

function safeImageUrl(value: string) {
  const url = safeLink(value);
  return url;
}

function safeLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function countdownValues(value: string): Array<[string, string]> {
  const target = new Date(value).getTime();
  const difference = Number.isFinite(target) ? Math.max(0, target - Date.now()) : 0;
  return [
    [String(Math.floor(difference / 86_400_000)).padStart(2, "0"), "zile"],
    [String(Math.floor((difference / 3_600_000) % 24)).padStart(2, "0"), "ore"],
    [String(Math.floor((difference / 60_000) % 60)).padStart(2, "0"), "minute"],
    [String(Math.floor((difference / 1_000) % 60)).padStart(2, "0"), "secunde"],
  ];
}

function mixHex(a: string, b: string, amount: number) {
  const parse = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const mix = (left: number, right: number) => Math.round(left * amount + right * (1 - amount)).toString(16).padStart(2, "0");
  return `#${mix(ar, br)}${mix(ag, bg)}${mix(ab, bb)}`;
}
