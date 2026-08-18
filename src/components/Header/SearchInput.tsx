import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Autocomplete, Group } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";

import classes from "./Header.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRef, useState } from "react";

const AUTOCOMPLETE_URL = "/bie-index/search/auto";

export function SearchInput() {
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

  return (
    <form action="/bie-hub/" method="GET">
      <Group
        gap={"xs"}
        onMouseEnter={() => {
          setIsActive(true);
          inputRef.current?.focus();
        }}
        onMouseLeave={() => {
          setIsActive(false);
          inputRef.current?.blur();
        }}
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
        >
          <FontAwesomeIcon icon={faMagnifyingGlass} />
        </button>
      </Group>
    </form>
  );
}
