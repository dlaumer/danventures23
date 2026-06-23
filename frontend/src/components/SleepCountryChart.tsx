import type { CSSProperties } from "react";
import { Waves } from "lucide-react";
import type { SelectedChartPart, SleepCountryStat } from "../types";
import { formatCount } from "../utils";

type SleepCountryChartProps = {
  selectedPart: SelectedChartPart | null;
  selectedSleepCountry: string | null;
  stats: SleepCountryStat[];
  onSelectPart: (part: SelectedChartPart | null) => void;
  onSelectCountry: (country: string | null) => void;
};

const countryPalette = [
  "#3d6fb6",
  "#4f8f67",
  "#b8793b",
  "#8a63b8",
  "#b65f71",
  "#5f8f9c",
  "#96713f",
  "#6975bd",
];

function describeNights(value: number) {
  return `${formatCount(value)} ${value === 1 ? "night" : "nights"}`;
}

function logarithmicBarWidth(value: number, maxValue: number) {
  if (!value || !maxValue) return "0%";
  const linear = value / maxValue;
  const logarithmic = Math.log10(value + 1) / Math.log10(maxValue + 1);
  const blended = linear * 0.55 + logarithmic * 0.45;
  return `${Math.max(6, blended * 100)}%`;
}

function paleColor(color: string) {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return color;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, 0.18)`;
}

function colorForCountry(country: string) {
  let hash = 0;

  for (let index = 0; index < country.length; index += 1) {
    hash = (hash * 31 + country.charCodeAt(index)) >>> 0;
  }

  return countryPalette[hash % countryPalette.length];
}

function FlagIcon({ country, iso2 }: { country: string; iso2: string | null }) {
  if (!iso2) {
    return country === "At sea" ? <Waves size={14} /> : <span>?</span>;
  }

  return (
    <img
      alt=""
      className="country-flag"
      src={`https://flagcdn.com/w20/${iso2.toLowerCase()}.png`}
    />
  );
}

export function SleepCountryChart({
  selectedPart,
  selectedSleepCountry,
  stats,
  onSelectPart,
  onSelectCountry,
}: SleepCountryChartProps) {
  const items = stats.filter((item) => item.night_count > 0);
  const maxValue = Math.max(...items.map((item) => item.night_count), 0);

  if (!items.length || !maxValue) {
    return <div className="transport-chart empty">No country sleep data</div>;
  }

  return (
    <div className="bar-chart country-chart" aria-label="Nights by country">
      <div className="bar-chart-rows">
        {items.map((item) => {
          const color = colorForCountry(item.country);
          const id = `sleep-country:${item.country}`;
          const isSelected =
            selectedSleepCountry === item.country || selectedPart?.id === id;
          const width = logarithmicBarWidth(item.night_count, maxValue);

          return (
            <button
              type="button"
              className={`bar-chart-row ${isSelected ? "selected" : ""}`}
              key={item.country}
              onClick={() => {
                const nextCountry = isSelected ? null : item.country;
                onSelectCountry(nextCountry);
                onSelectPart(
                  nextCountry === null
                    ? null
                    : {
                        color,
                        id,
                        label: item.country,
                        value: item.night_count,
                      },
                );
              }}
              title={`${item.country}: ${describeNights(item.night_count)}`}
            >
              <span className="bar-chart-label country-chart-label">
                <span className="bar-chart-icon" style={{ color }}>
                  <FlagIcon country={item.country} iso2={item.iso2} />
                </span>
                <span>{item.country}</span>
              </span>
              <span className="bar-track">
                <span
                  className="bar-fill"
                  style={
                    {
                      backgroundColor: paleColor(color),
                      borderColor: color,
                      width,
                    } as CSSProperties
                  }
                />
              </span>
              <strong>{describeNights(item.night_count)}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}
