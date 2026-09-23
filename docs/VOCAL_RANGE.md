# Rising-key exercises and comfortable range

New exercises open with rising keys and eight passes by default; a saved range adjusts the starting root and number of passes. Each pass has a triad one semitone below the tonic, followed by the tonic chord (with a doubled root), then the target notes. Major exercises use major triads, minor exercises use minor triads. In G major: F# major → G major → D–C–B–A–G. This is a chromatic approach to the tonic, computed from the fitted root, never fixed F# and G notes. Notes within each chord sound together. This follows the user's reference; exact octave voicing is not established by the screenshot. At sample boundaries the accompaniment shifts an octave to stay within C2–C6.

The controls offer a semitone/whole-tone step (default semitone) and the number of passes. The format selector and floating pass status have been removed. The upper limit is 10, further limited by available piano samples and the existing 128-target-note history limit. Earlier single-pass history remains compatible.

Preparation uses fixed durations: 0.5 seconds for the first chord, immediately followed by a 1-second second chord, then 0.15 seconds before singing. The next pass starts its chords 0.3 seconds after the last target ends. These durations do not change with the singing tempo.

## Personal range

The separate “Vocal range” dialog measures a comfortable low and high note. Its microphone button starts capture independently of audio settings. Each note requires roughly two seconds of stable voiced input and explicit confirmation that it is comfortable. Silence, interrupted input, unstable pitch and octave jumps do not produce a measurement. Closing the dialog releases the microphone. Audio settings retain device, sensitivity and latency controls.

We leave one semitone inside both measured endpoints. For melody interval bounds `min..max`, starting roots must satisfy `low + 1 - min <= root <= high - 1 - max`, intersected with the exercise's supported root bounds. Starting at the lowest fitting root, passes rise by the selected step while the complete melody still fits. Thus a narrow range can produce fewer than seven passes; ten is a ceiling, not a target to force.

The profile is stored on this device under a guest/account-specific local-storage key. Opening exercises and restoring the last exercise apply it. Manual controls can override the fit; a notice appears if targets exceed the saved comfortable range. If no complete melody fits, the notice asks for a narrower melody or manual adjustment. Profiles are not currently synchronized to other devices.

This measures usable pitch range, not soprano/alto/tenor/baritone classification. Tessitura and tone colour also matter. No automatic voice-type label is assigned.

## Playback and history

Preparation notes are quieter, use the existing piano samples and share the same audio clock and pause behavior as the exercise. They are excluded from scoring. Each pass has a short breathing gap; only target durations contribute to the score. The staff follows the current key.

One full series is one attempt. Settings include optional `series: { rounds, step }` in the existing practice JSON. Earlier single-pass attempts remain compatible; no SQL migration is required. Fragments retain original note positions and pitch, including later passes, and replay without the preparation chords. Different series settings have separate comparison keys.

Validation: unit tests cover timeline transposition, sample availability, target limits, scoring exclusion, fragment pitch, range fitting and capture rejection. Audio-engine tests cover scheduling, pause and a single completed attempt. Browser tests use synthetic microphone input; real voices and hardware latency still require hands-on testing.
