import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Autocomplete, Group } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";

import classes from "./Header.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRef, useState } from "react";

const AUTOCOMPLETE_URL = "/bie-index/search/auto";

export function SearchInput({ expandRight }: { expandRight?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const fetchSuggestions = useDebouncedCallback(async (q: string) => {
    if (!q.trim()) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`${AUTOCOMPLETE_URL}?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSuggestions([
        ...new Set(
          (data.autoCompleteList ?? []).map(
            (item: { name: string }) => item.name,
          ),
        ),
      ] as string[]);
    } catch {
      setSuggestions([]);
    }
  }, 200);

  // ponytail: no hover-open in the burger row, the form moves under the
  // cursor when it opens and hover would flicker
  const hover = expandRight
    ? {}
    : {
        onMouseEnter: () => {
          setIsActive(true);
          inputRef.current?.focus();
        },
        onMouseLeave: () => {
          setIsActive(false);
          inputRef.current?.blur();
        },
      };

  return (
    <form
      action="/bie-hub/"
      method="GET"
      className={expandRight && isActive ? classes.searchActive : undefined}
      onBlur={(event) => {
        // ponytail: close only when focus actually leaves the form
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsActive(false);
        }
      }}
    >
      <Group
        gap={"xs"}
        className={expandRight ? classes.searchExpandRight : undefined}
        {...hover}
      >
        <Autocomplete
          ref={inputRef}
          className={`${classes.searchInputWrapper} ${isActive ? "" : classes.hidden}`}
          onChange={fetchSuggestions}
          onOptionSubmit={() => inputRef.current?.form?.requestSubmit()}
          name="q"
          placeholder="Search"
          data={suggestions}
        />
        <input type="hidden" name="sortField" value="score" />
        <button
          type="submit"
          className={`${classes.menuLink} ${classes.iconLink} ${classes.searchInputButton} ${isActive && classes.searchInputButtonActive}`}
          onClick={(event) => {
            // ponytail: empty input = open/focus instead of submitting.
            // Covers touch (no hover) and blocks empty searches on desktop.
            if (!inputRef.current?.value) {
              event.preventDefault();
              setIsActive(true);
              inputRef.current?.focus();
            }
          }}
        >
          <FontAwesomeIcon icon={faMagnifyingGlass} />
        </button>
      </Group>
    </form>
  );
}
