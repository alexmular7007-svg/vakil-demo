"use client";

import { useId, useMemo, useState } from "react";
import { daysBetween, shiftDate } from "@/lib/calculators/days";
import { formatDay, formatDayLong, plural, type PeriodUnit } from "@/lib/calculators/dates";
import { Card } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { CalculatorDisclaimer, CheckRow, ChoiceChips, DateField, ResultHero, ResultPlaceholder, StatusChip, WorkingCard } from "./parts";
import { useTodayInIndia } from "./use-today";

type Mode = "between" | "shift";

export function DaysCalculator() {
  const ids = useId();
  const today = useTodayInIndia();
  const [mode, setMode] = useState<Mode>("between");
  const [includeFirstDay, setIncludeFirstDay] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [base, setBase] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<PeriodUnit>("days");
  const [direction, setDirection] = useState<"add" | "subtract">("add");

  const between = useMemo(() => (mode === "between" && a && b ? daysBetween(a, b, { includeFirstDay }) : null), [mode, a, b, includeFirstDay]);
  const shifted = useMemo(() => {
    if (mode !== "shift" || !base || amount === "") return null;
    return shiftDate(base, Number(amount), unit, { direction, includeFirstDay });
  }, [mode, base, amount, unit, direction, includeFirstDay]);

  const result = mode === "between" ? between : shifted;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
      <Card className="space-y-5 p-4 sm:p-6">
        <ChoiceChips
          label="Calculation"
          value={mode}
          onChange={setMode}
          options={[
            { value: "between", label: "Days between dates" },
            { value: "shift", label: "Add or subtract" },
          ]}
        />
        {mode === "between" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField label="From" value={a} onChange={setA} required />
            <DateField label="To" value={b} onChange={setB} required />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField label="Starting date" value={base} onChange={setBase} required className="sm:col-span-2" />
            <Field label="Add or subtract" htmlFor={`${ids}-dir`}>
              <Select id={`${ids}-dir`} value={direction} onChange={(e) => setDirection(e.target.value as "add" | "subtract")}>
                <option value="add">Add (a date after)</option>
                <option value="subtract">Subtract (a date before)</option>
              </Select>
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <Field label="How many" htmlFor={`${ids}-n`} required>
                <Input
                  id={`${ids}-n`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  className="tabular"
                  placeholder="30"
                />
              </Field>
              <Field label="Unit" htmlFor={`${ids}-u`}>
                <Select id={`${ids}-u`} value={unit} onChange={(e) => setUnit(e.target.value as PeriodUnit)}>
                  <option value="days">Days</option>
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                </Select>
              </Field>
            </div>
          </div>
        )}
        <CheckRow
          label="Count the first day too"
          hint="Off by default: “from” excludes the first day (s. 9, General Clauses Act, 1897; s. 12(1), Limitation Act). Turn on only where the rule counts both ends."
          checked={includeFirstDay}
          onChange={setIncludeFirstDay}
        />
      </Card>

      <div className="space-y-4">
        {!result || !result.ok ? (
          <ResultPlaceholder
            title={mode === "between" ? "Enter two dates" : "Enter a date and a period"}
            body="Calendar days in India (IST). Months and years land on the corresponding date of the British calendar."
            errors={result && !result.ok ? result.errors : undefined}
          />
        ) : between && between.ok && mode === "between" ? (
          <>
            <ResultHero
              eyebrow={includeFirstDay ? "Days, counting both dates" : "Days between the dates"}
              value={plural(between.days, "day")}
              caption={`${plural(between.weeks, "week")} and ${plural(between.weekRemainder, "day")}`}
            >
              {between.span.years || between.span.months ? (
                <p className="tabular">
                  {[between.span.years ? plural(between.span.years, "year") : null, between.span.months ? plural(between.span.months, "month") : null, plural(between.span.days, "day")]
                    .filter(Boolean)
                    .join(", ")}{" "}
                  ({formatDay(between.from)} to {formatDay(between.to)})
                </p>
              ) : (
                <p className="tabular">
                  {formatDay(between.from)} to {formatDay(between.to)}
                </p>
              )}
            </ResultHero>
            <WorkingCard steps={between.steps} copyTitle={`Days from ${formatDay(between.from)} to ${formatDay(between.to)}: ${between.days}`} />
          </>
        ) : shifted && shifted.ok ? (
          <>
            <ResultHero
              eyebrow={direction === "add" ? "Date after the period" : "Date before the period"}
              value={formatDayLong(shifted.result)}
              chip={
                today && shifted.result < today ? (
                  <StatusChip tone="neutral">In the past</StatusChip>
                ) : today && shifted.result === today ? (
                  <StatusChip tone="warning">Today</StatusChip>
                ) : null
              }
            >
              {shifted.clamped ? "No corresponding day in that month, so the result is the month's last day." : "If this is a court holiday, check whether you may act on the next working day."}
            </ResultHero>
            <WorkingCard steps={shifted.steps} copyTitle={`Date calculation from ${formatDay(base)}`} />
          </>
        ) : null}
        <CalculatorDisclaimer
          sources={<>Counting rules: s. 3(35), s. 3(66) and s. 9, General Clauses Act, 1897. Court holidays are not applied: check your court&apos;s calendar.</>}
        />
      </div>
    </div>
  );
}
