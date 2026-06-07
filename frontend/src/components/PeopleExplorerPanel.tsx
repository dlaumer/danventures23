import {
  Bike,
  Bus,
  Car,
  Footprints,
  LocateFixed,
  Plane,
  Search,
  Ship,
  Train,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { PeopleStory } from "../types";
import { formatTimelineDate, transportLabel } from "../utils";

type PeopleExplorerPanelProps = {
  query: string;
  selectedIndex: number;
  stories: PeopleStory[];
  onClose: () => void;
  onFocusStory: (story: PeopleStory) => void;
  onQueryChange: (query: string) => void;
  onSelectedIndexChange: (index: number) => void;
};

const peopleWheelItemHeight = 26;

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function transportIconFor(value: string | null) {
  const size = 14;

  switch (value) {
    case "bike":
      return <Bike size={size} />;
    case "bus":
      return <Bus size={size} />;
    case "boat":
    case "ferry":
      return <Ship size={size} />;
    case "foot":
      return <Footprints size={size} />;
    case "plane":
      return <Plane size={size} />;
    case "train":
      return <Train size={size} />;
    case "truck":
      return <Truck size={size} />;
    case "friends":
      return <Users size={size} />;
    case "car":
    case "rentalCar":
    case "taxi":
    default:
      return <Car size={size} />;
  }
}

export function PeopleExplorerPanel({
  query,
  selectedIndex,
  stories,
  onClose,
  onFocusStory,
  onQueryChange,
  onSelectedIndexChange,
}: PeopleExplorerPanelProps) {
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const shouldRestoreScrollRef = useRef(true);
  const selectedIndexRef = useRef(selectedIndex);

  const filteredStories = useMemo(() => {
    const searchText = normalizeSearchText(query);
    if (!searchText) return stories;

    return stories.filter((story) => {
      return `${story.people} ${story.description}`
        .toLowerCase()
        .includes(searchText);
    });
  }, [query, stories]);

  const selectedStory = filteredStories[selectedIndex] ?? null;
  const visibleStart = Math.max(0, selectedIndex - 18);
  const visibleEnd = Math.min(filteredStories.length, selectedIndex + 19);
  const visibleStories = filteredStories.slice(visibleStart, visibleEnd);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    if (selectedIndex >= 0) return;
    if (filteredStories.length === 0) return;

    const nextIndex = Math.max(0, Math.floor(filteredStories.length / 2));
    selectedIndexRef.current = nextIndex;
    onSelectedIndexChange(nextIndex);

    window.requestAnimationFrame(() => {
      wheelRef.current?.scrollTo({ top: nextIndex * peopleWheelItemHeight });
    });
  }, [filteredStories.length, onSelectedIndexChange, selectedIndex]);

  useEffect(() => {
    if (selectedIndex < 0) return;
    if (selectedIndex >= filteredStories.length) {
      const nextIndex = Math.max(0, filteredStories.length - 1);
      selectedIndexRef.current = nextIndex;
      onSelectedIndexChange(nextIndex);
    }
  }, [filteredStories.length, onSelectedIndexChange, selectedIndex]);

  useEffect(() => {
    if (!shouldRestoreScrollRef.current) return;
    if (selectedIndex < 0) return;

    shouldRestoreScrollRef.current = false;
    wheelRef.current?.scrollTo({ top: selectedIndex * peopleWheelItemHeight });
  }, [selectedIndex]);

  function handleWheelScroll() {
    const wheel = wheelRef.current;
    if (!wheel) return;

    const nextIndex = Math.max(
      0,
      Math.min(
        filteredStories.length - 1,
        Math.round(wheel.scrollTop / peopleWheelItemHeight),
      ),
    );

    if (nextIndex !== selectedIndexRef.current) {
      selectedIndexRef.current = nextIndex;
      onSelectedIndexChange(nextIndex);
    }
  }

  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>People explorer</h2>
        </div>
        <div className="people-heading-actions">
          {selectedStory && (
            <button
              type="button"
              className="panel-icon-button people-heading-zoom"
              onClick={() => onFocusStory(selectedStory)}
              disabled={!selectedStory.coordinates}
              title="Zoom to spot"
              aria-label="Zoom to spot"
            >
              <LocateFixed size={16} />
            </button>
          )}
          <button
            type="button"
            className="panel-close-button"
            onClick={onClose}
            title="Close panel"
            aria-label="Close panel"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="people-explorer">
        <label className="people-search">
          <Search size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search people or stories"
            aria-label="Search people or stories"
          />
        </label>

        {filteredStories.length > 0 ? (
          <>
            <div
              ref={wheelRef}
              className="people-wheel"
              role="listbox"
              aria-label="Free transport people"
              aria-activedescendant={selectedStory?.id}
              onScroll={handleWheelScroll}
            >
              <div
                className="people-wheel-spacer"
                style={{
                  height: 52 + visibleStart * peopleWheelItemHeight,
                }}
                aria-hidden="true"
              />
              {visibleStories.map((story, visibleIndex) => {
                const index = visibleStart + visibleIndex;
                const distance = Math.abs(index - selectedIndex);
                const focusClass =
                  distance === 0
                    ? "focused"
                    : distance === 1
                      ? "near"
                      : distance === 2
                        ? "far"
                        : "hidden";

                return (
                  <div
                    id={story.id}
                    key={story.id}
                    role="option"
                    aria-selected={index === selectedIndex}
                    className={`people-wheel-item ${focusClass}`}
                  >
                    <span>{story.people}</span>
                    <small>{formatTimelineDate(story.date)}</small>
                  </div>
                );
              })}
              <div
                className="people-wheel-spacer"
                style={{
                  height:
                    52 +
                    (filteredStories.length - visibleEnd) *
                      peopleWheelItemHeight,
                }}
                aria-hidden="true"
              />
            </div>

            {selectedStory && (
              <section className="people-story-detail" aria-live="polite">
                <div className="people-story-meta">
                  <span
                    className="transport-icon-meta"
                    title={transportLabel(selectedStory.transport)}
                    aria-label={transportLabel(selectedStory.transport)}
                  >
                    {transportIconFor(selectedStory.transport)}
                  </span>
                  <span>{selectedStory.locationName}</span>
                  <span>{formatTimelineDate(selectedStory.date)}</span>
                </div>
                <p>{selectedStory.description || "No story saved yet."}</p>
              </section>
            )}
          </>
        ) : (
          <div className="people-empty">No matching free transport stories</div>
        )}
      </div>
    </>
  );
}
