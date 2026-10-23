import type { CnFunction } from "cn"
import { createCn } from "cn/config"

/**
 * Class merging that knows our custom tokens. The stock `cn` treats unknown `text-*` names as
 * colours, so `cn("text-reading", "text-ash-gray")` silently dropped the font size.
 * Keep these lists in step with the --text-* and --radius-* names in ../styles/tokens.css.
 * Components import cn from here, never from "cn" directly (Biome enforces it).
 */
export const cn: CnFunction = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            // marketing scale (DESIGN.md)
            "caption",
            "nav-label",
            "body",
            "heading-2xs",
            "heading-xs",
            "subheading",
            "heading-sm",
            "heading",
            "heading-lg",
            "display",
            // app scale (plan §7.2)
            "micro",
            "meta",
            "snippet",
            "ui",
            "reading",
            "editor",
            "subhead",
          ],
        },
      ],
      rounded: [{ rounded: ["card"] }],
    },
  },
})
