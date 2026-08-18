"use client";

import React from "react";
import { Group } from "@mantine/core";

import { VbpLogo } from "../logos/VbpLogo";

import classes from "./Header.module.css";
import { LanguageDropDown } from "./LanguageDropDown";
import { LoginDropDown } from "./LoginDropdown";
import { HelpDropDown } from "./HelpDropDown";
import { GeographicDropDown } from "./GeographicDropDown";
import { SearchInput } from "./SearchInput";

interface HeaderProps {
  onAuthClick?: React.MouseEventHandler<HTMLButtonElement>;
  onSearchClick?: React.MouseEventHandler<HTMLButtonElement>;
  isAuthenticated?: boolean;
  fullWidth?: boolean;
  compact?: boolean;
  homeUrl?: string;
  myProfileUrl?: string;
  isLegacySkin?: boolean;
}

export function Header({
  onAuthClick,
  onSearchClick,
  isAuthenticated,
  homeUrl = "https://www.ala.org.au/",
  myProfileUrl = "https://auth.ala.org.au/userdetails/myprofile",
  fullWidth = false,
  compact = false,
  isLegacySkin = false,
}: HeaderProps): React.ReactElement {
  return (
    <header className={classes.header}>
      <VbpLogo homeUrl="/" hoverVariant="blue" />
      <Group className={classes.navItems} gap={0}>
        <a
          className={classes.menuLink}
          href="/bie-hub/search?q=&fq=idxtype:%22TAXON%22&sortField=occurrenceCount"
        >
          Soorten
        </a>
        <a
          className={classes.menuLink}
          href="/biocache-hub/occurrences/search?q=&fq=cl102%3A%22Vlaams+Gewest%22"
        >
          Waarnemigen
        </a>
        <GeographicDropDown />
      </Group>
      <Group gap={0}>
        <SearchInput />
        <HelpDropDown />
        <LoginDropDown isAuthenticated onAuthClick />
        <LanguageDropDown className={classes.menuLink} />
      </Group>
    </header>
  );
}
