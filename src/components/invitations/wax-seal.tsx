import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
  invitationSealAsset,
  type InvitationSealStyle,
} from "@/lib/invitations/seals";
import styles from "./wax-seal.module.css";

export function WaxSeal({
  sealStyle,
  monogram,
  color,
  className,
}: {
  sealStyle: InvitationSealStyle;
  monogram?: string | null;
  color: string;
  className?: string;
}) {
  const asset = invitationSealAsset(sealStyle);
  const trimmedMonogram = monogram?.trim() || "S";

  return (
    <span
      className={cn(styles.root, className)}
      data-seal-style={sealStyle}
      style={
        {
          "--wax-color": color,
          "--wax-artwork": `url(${JSON.stringify(asset)})`,
        } as CSSProperties
      }
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.artwork}
        src={asset}
        alt=""
        width="512"
        height="512"
        decoding="async"
        draggable={false}
      />
      {sealStyle === "monogram" ? (
        <span
          className={cn(
            styles.monogram,
            trimmedMonogram.length > 5
              ? styles.monogramLong
              : trimmedMonogram.length > 2
                ? styles.monogramCompact
                : undefined,
          )}
        >
          {trimmedMonogram}
        </span>
      ) : null}
    </span>
  );
}
