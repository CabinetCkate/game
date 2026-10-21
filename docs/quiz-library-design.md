# Studio topic library

Direct build against the existing `show.css` studio: violet primary actions,
dark translucent panels, Manrope, existing 3D stage and character models.
Refero research was attempted; the connector returned `NO_SUBSCRIPTION`.
Fallback references: the existing studio/lobby and Refero's bundled
`craft-details.md` (forms, visible keyboard focus, inline error recovery).

Decisions:
- Keep the existing studio as the dominant visual target.
- Solo: a compact saved-topic picker and one Create button. Authoring opens a
  separate dialog, without online room/join forms.
- Authoring: title, lecture/ready-test choice, file or editable source, save,
  then an exact question/answer preview. Generation and import both persist.
- Online: add ready-test and saved-topic sources to the existing room form.
- Use portraits rendered from the actual licensed glTF characters. Prefer a
  student's existing HTTPS profile photo. Keep names beside every portrait.
- Keep scores visible during answering; publish awarded points at the shared
  round reveal. Use the same authoritative scoring for custom bot practice.
- Preserve authored questions and answer keys when reusing a saved topic.
