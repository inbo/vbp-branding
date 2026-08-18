import React from "react";

import logoSvg from "../../static/logo.svg?raw";
import classes from "./VbpLogo.module.css";

/** Colourways defined in `src/static/logo.svg` */
export const vbpLogoVariants = [
  "plum",
  "mauve",
  "lime",
  "slate-pink",
  "cyan",
  "slate-cyan",
  "olive",
  "orange",
  "blue",
  "taupe",
  "moss",
  "mint",
] as const;

export type VbpLogoVariant = (typeof vbpLogoVariants)[number];

type VbpLogoProps = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLSpanElement>,
  HTMLSpanElement
> & {
  variant?: VbpLogoVariant;
  /** Colourway to switch to while hovered (pure CSS, no JS state) */
  hoverVariant?: VbpLogoVariant;
  homeUrl?: string;
};

export function VbpLogo({
  variant = "plum",
  hoverVariant,
  homeUrl,
  className,
  ...props
}: VbpLogoProps): React.ReactElement {
  const svgClass = ["vbp-logo", variant, hoverVariant && `hover-${hoverVariant}`]
    .filter(Boolean)
    .join(" ");
  const image = (
    <span
      role="img"
      aria-label="Vlaams Biodiversiteitsportaal"
      className={`${classes.logo} ${className || ""}`}
      // ponytail: the colourway classes live inside the SVG, so it has to be
      // inlined (an <img> can't be styled from outside). Source is a build-time
      // constant, not user input.
      dangerouslySetInnerHTML={{
        __html: logoSvg.replace('class="vbp-logo"', `class="${svgClass}"`),
      }}
      {...props}
    />
  );

  if (homeUrl) {
    return (
      <a href={homeUrl} className={classes.logoLink}>
        {image}
      </a>
    );
  }

  return image;
}
