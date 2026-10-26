"use client";

import { CalendarDays } from "lucide-react";
import { AppSelect } from "@/components/ui/app-select";

type MonthPickerProps = {
  value: string;
  months: string[];
  label: string;
  onChange: (month: string) => void;
};

function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

export function MonthPicker({ value, months, label, onChange }: MonthPickerProps) {
  const options = [...new Set([value, ...months])].sort((left, right) => right.localeCompare(left));

  return (
    <div className="select-small month-picker">
      <CalendarDays size={14} aria-hidden="true" />
      <AppSelect aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((month) => (
          <option key={month} value={month}>{formatMonth(month)}</option>
        ))}
      </AppSelect>
    </div>
  );
}
