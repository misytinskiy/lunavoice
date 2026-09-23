# Languages

The application supports English (`en`, the default), Ukrainian (`uk`) and Russian (`ru`). The header selector saves the choice in `lunavoice.locale.v1` in localStorage. A missing, invalid or inaccessible setting defaults to English. Switching still works in the current tab when storage is blocked. Changes propagate to other open tabs and update the document language and title.

## Presentation and saved data

`app/lib/i18n/en.json` and `uk.json` contain translations keyed by the original Russian messages. Russian uses the source message. `t()` translates at render time; existing engine notices, exercise IDs, saved attempts and filter values remain stable. Legacy dynamic notices use numbered placeholders, and composite labels translate complete known phrases. Do not pass arbitrary user-authored text through the translator. Names and email inputs are not translated.

Exercise syllables are phonetic prompts: English uses Latin spellings and Ukrainian uses Ukrainian spellings for the same intended sounds. MIDI, timings, audio samples and scoring are unchanged. Canvas labels read the active language. Date labels use the active locale.

`useLocale()` subscribes to the shared preference without remounting the audio engine or resetting a session. The auth callback also restores the language. No database migration is needed. Supabase email templates and Google’s own sign-in screens are configured outside this application and are not controlled by this selector.

## Adding text

Add the source message and both translations to the dictionaries. Preserve numbered placeholders. Localize UI text, accessible labels, confirmations and canvas text at their presentation boundary. Preserve canonical `value` attributes on options and stable identifiers in storage. Do not translate data used for comparisons.

## Verification

`npm test` checks dictionary parity, placeholders, exercise coverage, legacy messages and locale behavior. `tests/browser/i18n.spec.mjs` checks the default, switching, reload persistence, filters, account forms, storage failure, mobile layout and an active microphone session. Existing browser regressions explicitly select Russian.
