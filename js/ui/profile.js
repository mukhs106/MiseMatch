// Requirements and settings: standing requirements (each adaptation can adjust
// them for the day), preferences, and what the demo data is and isn't.

import { html } from "./html.js";
import { icon } from "./icons.js";
import { RECIPES } from "../data/recipes.js";
import { ITEMS, NUTRITION_SOURCE, shortName } from "../data/items.js";
import { normalizeConstraints } from "../core/constraints.js";
import { keyLines } from "../core/suggest.js";
import { constraintsForm, capitalize } from "./parts.js";

export function profileView(ctx) {
  const c = normalizeConstraints(ctx.state.profile);
  const dislikeOptions = [...new Set(RECIPES.flatMap((r) => keyLines(r).map((l) => l.item)))].filter((id) => ITEMS[id]).sort((a, b) => shortName(a).localeCompare(shortName(b)));
  return html`
    <div class="page profile-page">
      <a class="back-link" href="#/">${icon("back")} Today</a>
      <header class="list-head">
        <h1 tabindex="-1" data-route-focus>Requirements and settings</h1>
        <p class="muted">Saved on this device only. There are no accounts.</p>
      </header>

      <section class="profile-group" aria-labelledby="req-h">
        <h2 id="req-h">Your usual requirements</h2>
        <p class="small muted">Used for suggestions and as the starting point when you adapt a dish. You can change them for one dish without changing these.</p>
        ${constraintsForm(c, "profile")}
        <div class="notice notice--cool">${icon("info")}<p>We flag ingredients that conflict with what you've told us, using our own ingredient data. That data can be incomplete and can't see product labels, so nothing here confirms a dish is safe for an allergy. Check labels and your own needs.</p></div>
      </section>

      <section class="profile-group" aria-labelledby="dis-h">
        <h2 id="dis-h">Rather not</h2>
        <p class="small muted">A preference, not a requirement: versions with these rank lower but aren't excluded.</p>
        <div class="chips" role="group" aria-labelledby="dis-h">
          ${dislikeOptions.map((id) => html`<button class="chip" aria-pressed="${c.dislikes.includes(id)}" data-action="c-dislike" data-scope="profile" data-value="${id}">${c.dislikes.includes(id) ? icon("check") : ""}${capitalize(shortName(id))}</button>`)}
        </div>
      </section>

      <section class="profile-group" aria-labelledby="settings-h">
        <h2 id="settings-h">About this prototype</h2>
        <ul class="small about-list">
          <li><strong>Recipes</strong> are home-style versions written for this prototype, not kitchen-tested.</li>
          <li><strong>Adaptations</strong> are rule-based suggestions written for each dish. None has been cooked and checked by our team yet, and there are no community cooking reports.</li>
          <li><strong>Nutrition</strong>: ${NUTRITION_SOURCE.detail}</li>
          <li><strong>Photos</strong> are from Pexels under its free license; individual page links are still being recorded.</li>
          <li><strong>Not built yet:</strong> reading real web links, screenshots or video, accounts, sharing or publishing versions, live AI suggestions.</li>
        </ul>
        <button class="btn btn--secondary" data-action="reset-demo">Reset demo</button>
        <p class="small muted">Reset clears everything you've done in this browser.</p>
      </section>
    </div>`;
}
