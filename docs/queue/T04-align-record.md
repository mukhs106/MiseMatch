# T04: Align build with decision record

Goal: Resolve contradictions C1 to C10 so the build, the record, and the T01 screenshots agree.

Decisions:
- C8: Move partial amounts out of the shared on-hand list into each recipe's adaptation state. The shared list keeps presence only. This removes the double-counting limitation; delete the list note and the limitation entry once verified.
- C1: Restyle the secondary button as a tonal fill with ink text and no outline: #F3F2E7 on white surfaces, white on #F3F2E7 surfaces. Primary stays burgundy.
- C3: Keep the four drawn accents as temporary placeholders, each in its own SVG under assets/accents/ so my drawings can replace them. Update the rule to: placeholder accents are allowed if swappable and recorded as temporary.
- C4: The record was wrong. Canned tomato copy: more concentrated, cooked flavor, can be slightly more acidic, less fresh brightness.
- C5: Keep ground ginger with the garlic. Update the record to match.
- C6: Add a plain note to paneer: contains dairy. State it as a fact, not as allergy guidance.
- C2: The build's colors win. Update the record's color table to match the tokens.
- C7: Show swap entry points only where swaps exist. Do not add dead-end buttons. Update the rule.
- C9: Remove generic "No change." text. Show a dimension only when the data says something about it.
- C10: When servings change from the original, show one short note that cooking times, pan size, and oil may need adjusting. No per-ingredient logic.

Out of scope: anything not listed.

Done when:
- Partial amounts are per recipe, and two recipes no longer double count
- The C1, C6, C9, and C10 changes are visible at 430px and 1280px
- npm test passes, with a test added for per-recipe partial amounts
- The record and the code agree on C1 to C10
- Committed and pushed
