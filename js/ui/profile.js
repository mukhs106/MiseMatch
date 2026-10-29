// Profile and settings: a pushed screen from the avatar. Preferences arrive in
// T06; for now it holds the settings that exist and says what isn't built yet.

import { html } from "./html.js";
import { icon } from "./icons.js";

export function profileView() {
  return html`
    <div class="page profile-page">
      <a class="back-link" href="#/">${icon("back")} Recipes</a>
      <header class="list-head">
        <h1 tabindex="-1" data-route-focus>Profile and settings</h1>
        <p class="muted">Saved on this device only. There are no accounts.</p>
      </header>

      <section class="profile-group" aria-labelledby="prefs-h">
        <h2 id="prefs-h">Preferences</h2>
        <p class="small muted">Food preferences, dietary pattern, allergies and nutrition goals aren't built yet. Until then, protein and fiber goals are on each recipe's Ideas.</p>
      </section>

      <section class="profile-group" aria-labelledby="settings-h">
        <h2 id="settings-h">Settings</h2>
        <h3 class="eyebrow">About the demo data</h3>
        <p class="small muted">
          The recipes and swaps are demo data written for this prototype, not tested sources.
          Nutrition figures are rough ranges from typical values, and swaps are not checked for allergy safety.
        </p>
        <p class="small muted">Not built yet: importing from links or video, accounts, live AI suggestions, onboarding.</p>
        <button class="btn btn--secondary" data-action="reset-demo">Reset demo</button>
        <p class="small muted">Reset clears your saved recipes, adapted versions, pantry and grocery list on this device.</p>
      </section>
    </div>`;
}
