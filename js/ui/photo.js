// Recipe photos and the designed fallback tile.
//
// Variants come from tools/images/build.mjs: assets/img/<name>-<width>.webp plus a
// .jpg fallback, at 480, 960 and 1440 px wide. A recipe only has `image` when a
// photo actually shows that dish; every other recipe gets the tile. The tile sits
// under the photo, so a missing or failed photo (marked .is-failed by app.js)
// shows the tile instead of a broken image.

import { html } from "./html.js";
import { icon } from "./icons.js";

const WIDTHS = [480, 960, 1440];
const srcset = (name, ext) => WIDTHS.map((w) => `assets/img/${name}-${w}.${ext} ${w}w`).join(", ");

// Crop ratios match the CSS frames (.photo--card 4:3, .photo--hero 4:5 on phones).
const FRAMES = {
  card: { w: 1440, h: 1080, sizes: "(min-width: 960px) 340px, (min-width: 720px) 300px, 128px" },
  hero: { w: 1440, h: 1800, sizes: "(min-width: 960px) 480px, (min-width: 720px) 640px, 100vw" },
};

/**
 * @param recipe  source recipe; uses recipe.image { name, alt, focal: { card, hero } } when present
 * @param frame   "card" | "hero"
 * @param loading "lazy" below the fold, "eager" for the detail hero
 */
export function recipePhoto(recipe, frame, { loading = "lazy" } = {}) {
  const f = FRAMES[frame];
  const img = recipe.image;
  return html`
    <div class="photo photo--${frame}">
      <div class="photo-tile" aria-hidden="true">${icon("book")}<span class="photo-tile-name">${recipe.title}</span></div>
      ${img ? html`
        <picture>
          <source type="image/webp" srcset="${srcset(img.name, "webp")}" sizes="${f.sizes}">
          <img src="assets/img/${img.name}-960.jpg" srcset="${srcset(img.name, "jpg")}" sizes="${f.sizes}"
            width="${f.w}" height="${f.h}" alt="${img.alt}" loading="${loading}" decoding="async"
            ${loading === "eager" ? html`fetchpriority="high"` : ""} style="object-position: ${img.focal?.[frame] ?? "50% 50%"}">
        </picture>` : ""}
    </div>`;
}

/**
 * A supporting food image (not a recipe photo): decorative, empty alt, at most one
 * per screen. Cutouts have WebP with alpha only. Hidden by app.js if it fails.
 */
export function supportingImage(name, { width, height, sizes, className = "" }) {
  return html`<img class="supporting ${className}" src="assets/img/${name}-480.webp" srcset="${srcset(name, "webp")}"
    sizes="${sizes}" width="${width}" height="${height}" alt="" loading="eager" decoding="async">`;
}
