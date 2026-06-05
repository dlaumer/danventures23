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
import { useEffect, useMemo, useRef, useState } from "react";
import type { PeopleStory } from "../types";
import { formatCount, formatTimelineDate, transportLabel } from "../utils";

type PeopleExplorerPanelProps = {
  stories: PeopleStory[];
  onClose: () => void;
  onFocusStory: (story: PeopleStory) => void;
};

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
  stories,
  onClose,
  onFocusStory,
}: PeopleExplorerPanelProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const selectedIndexRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const itemHeight = 40;

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

  useEffect(() => {
    const nextIndex = Math.max(0, Math.floor(filteredStories.length / 2));
    selectedIndexRef.current = nextIndex;
    setSelectedIndex(nextIndex);

    window.requestAnimationFrame(() => {
      wheelRef.current?.scrollTo({ top: nextIndex * itemHeight });
    });
  }, [filteredStories.length, itemHeight]);

  useEffect(() => {
    if (selectedIndex >= filteredStories.length) {
      const nextIndex = Math.max(0, filteredStories.length - 1);
      selectedIndexRef.current = nextIndex;
      setSelectedIndex(nextIndex);
    }
  }, [filteredStories.length, selectedIndex]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  function handleWheelScroll() {
    const wheel = wheelRef.current;
    if (!wheel) return;

    if (scrollFrameRef.current !== null) return;

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const nextIndex = Math.max(
        0,
        Math.min(
          filteredStories.length - 1,
          Math.round(wheel.scrollTop / itemHeight),
        ),
      );

      if (nextIndex !== selectedIndexRef.current) {
        selectedIndexRef.current = nextIndex;
        setSelectedIndex(nextIndex);
      }
    });
  }

  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>People explorer</h2>
        </div>
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

      <div className="people-explorer">
        <label className="people-search">
          <Search size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
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
              <div className="people-wheel-spacer" aria-hidden="true" />
              {filteredStories.map((story, index) => {
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
              <div className="people-wheel-spacer" aria-hidden="true" />
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
                <div className="people-story-stats">
                  <div>
                    <span>Story</span>
                    <strong>
                      {selectedStory.description.trim() ? "saved" : "empty"}
                    </strong>
                  </div>
                  <div>
                    <span>Entry</span>
                    <strong>
                      {formatCount(selectedIndex + 1)} /{" "}
                      {formatCount(filteredStories.length)}
                    </strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="people-zoom-button"
                  onClick={() => onFocusStory(selectedStory)}
                  disabled={!selectedStory.coordinates}
                >
                  <LocateFixed size={16} />
                  <span>Zoom to spot</span>
                </button>
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
