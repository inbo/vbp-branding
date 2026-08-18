import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Group, Input } from "@mantine/core";

import classes from "./Header.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRef, useState } from "react";

export function SearchInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isActive, setIsActive] = useState(false);

  return (
    <form action="/bie-hub/" method="GET">
      <Group
        gap={"xs"}
        onMouseEnter={() => {
          setIsActive(true);
          inputRef.current?.focus();
        }}
        onMouseLeave={() => setIsActive(false)}
      >
        <Input.Wrapper
          className={`${classes.searchInputWrapper} ${isActive ? "" : classes.hidden}`}
        >
          <Input ref={inputRef} name="q" />
        </Input.Wrapper>
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
