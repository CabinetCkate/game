# Game controls

The existing violet studio, answer cards and results podium are the visual reference.
Keep their colors, typography and spacing. The user requested these behavior changes;
this is a direct change to the existing interface, not a new visual direction.

Refero screen searches for quiz answer selection and completion screens were unavailable
(`NO_SUBSCRIPTION`). The bundled Refero `copywriting.md` and `craft-details.md` guide
the action labels, visible selection and keyboard focus. No new assets are needed.

- Keep mode buttons hidden during questions, round results and the final podium.
  Exit returns to the selection screen and restores them.
- Online selections remain editable until the shared deadline, even if everyone has
  selected. Only the latest choice earns points; correctness stays private until then.
- Bot practice starts with the selected topic and character, without a room-code screen.
  Selecting an answer highlights it. **Submit answer** commits it and resolves the bots
  immediately. Before confirmation, the player can select another answer.
- Reuse the existing primary button for confirmation, the existing violet selection
  color, and visible keyboard focus. Number keys select and Enter confirms curriculum answers.
- Translate quiz display text to the player's selected language. Preserve stable
  question/option IDs and the correct option; never register untranslated text as
  translations for all three languages.

Validation covers replacing answers before the deadline, rejecting late changes,
immediate bot resolution, starting without codes, selected-language generation and
saved-game display, and hiding/restoring modes on exit.
