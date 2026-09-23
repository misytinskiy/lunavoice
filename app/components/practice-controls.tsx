import { t } from "../lib/i18n";
import { getExercise, baseBounds } from "../lib/exercises";
import { practiceRange, type PracticeSettings } from "../lib/practice";
import { earText as tr } from "../lib/ear-training";
import { Select, SelectOption } from "./select";
export function PracticeControls({
  value,
  disabled,
  onChange,
}: {
  value: PracticeSettings;
  disabled: boolean;
  onChange: (value: PracticeSettings) => void;
}) {
  const exercise = getExercise(value.exerciseId),
    bounds = baseBounds(exercise);
  return (
    <div className="practice-options">
      <div className="practice-options-left">
        <div>
          <span className="eyebrow">{t("КОМФОРТНЫЙ ДИАПАЗОН")}</span>
          <div className="range-buttons">
            <button
              aria-label={t("Диапазон на полтона ниже")}
              disabled={disabled || value.baseMidi <= bounds.min}
              onClick={() =>
                onChange({ ...value, baseMidi: value.baseMidi - 1 })
              }
            >
              −
            </button>
            <strong>{t(practiceRange(value))}</strong>
            <button
              aria-label={t("Диапазон на полтона выше")}
              disabled={disabled || value.baseMidi >= bounds.max}
              onClick={() =>
                onChange({ ...value, baseMidi: value.baseMidi + 1 })
              }
            >
              +
            </button>
          </div>
        </div>
        <label>
          <span className="eyebrow">
            {t("ТЕМП ·") + " "}
            {t(value.bpm)} BPM
          </span>
          <input
            aria-label={t("Темп упражнения")}
            type="range"
            min={exercise.minBpm}
            max={exercise.maxBpm}
            step="5"
            value={value.bpm}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...value, bpm: Number(e.target.value) })
            }
          />
        </label>
      </div>
      {value.series && (
        <>
          <div className="practice-options-right">
            <label>
              <span className="eyebrow">{tr(["STEP", "КРОК", "ШАГ"])}</span>
              <Select
                aria-label={tr([
                  "Transposition step",
                  "Крок транспозиції",
                  "Шаг транспозиции",
                ])}
                value={value.series.step}
                disabled={disabled}
                onValueChange={(step) =>
                  onChange({
                    ...value,
                    fragment: null,
                    series: {
                      rounds: value.series!.rounds,
                      step: Number(step) as 1 | 2,
                    },
                  })
                }
              >
                <SelectOption value={1}>
                  {tr(["Semitone", "Півтон", "Полутон"])}
                </SelectOption>
                <SelectOption value={2}>
                  {tr(["Whole tone", "Тон", "Тон"])}
                </SelectOption>
              </Select>
            </label>
            <label>
              <span className="eyebrow">
                {tr(["PASSES", "ПРОХОДИ", "ПРОХОДЫ"])}
              </span>
              <Select
                aria-label={tr([
                  "Number of passes",
                  "Кількість проходів",
                  "Количество проходов",
                ])}
                value={value.series.rounds}
                disabled={disabled}
                onValueChange={(rounds) =>
                  onChange({
                    ...value,
                    fragment: null,
                    series: { ...value.series!, rounds: Number(rounds) },
                  })
                }
              >
                {Array.from(
                  {
                    length: Math.min(
                      10,
                      Math.floor(128 / exercise.notes.length),
                      1 +
                        Math.floor(
                          (bounds.max - value.baseMidi) / value.series!.step,
                        ),
                    ),
                  },
                  (_, i) => (
                    <SelectOption key={i} value={i + 1}>
                      {i + 1}
                    </SelectOption>
                  ),
                )}
              </Select>
            </label>
          </div>
          <p className="series-hint">
            {tr([
              "Two chords prepare each pass, then the melody moves up. Measure your vocal range to fit the starting key and number of passes.",
              "Два акорди готують кожен прохід, потім мелодія піднімається. Виміряй вокальний діапазон, щоб підібрати початкову тональність і кількість проходів.",
              "Два аккорда готовят каждый проход, затем мелодия поднимается. Измерь вокальный диапазон, чтобы подобрать начальную тональность и число проходов.",
            ])}
          </p>
        </>
      )}
    </div>
  );
}
