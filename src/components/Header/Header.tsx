"use client";

import React from "react";
import { Group, Menu, Stack } from "@mantine/core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars } from "@fortawesome/free-solid-svg-icons";

import { VbpLogo } from "../logos/VbpLogo";

import classes from "./Header.module.css";
import { LanguageDropDown } from "./LanguageDropDown";
import { LoginDropDown } from "./LoginDropdown";
import { HelpDropDown } from "./HelpDropDown";
import { GeographicDropDown } from "./GeographicDropDown";
import { SearchInput } from "./SearchInput";
import { BurgerIcons } from "./BurgerIcons";

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
  const navLinks = (accordionGeo?: boolean) => (
    <>
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
      <GeographicDropDown accordion={accordionGeo} />
    </>
  );

  const icons = (
    <>
      <SearchInput />
      <HelpDropDown />
      <LoginDropDown
        isAuthenticated={isAuthenticated || false}
        onAuthClick={onAuthClick}
      />
      <LanguageDropDown />
    </>
  );

  return (
    <header className={classes.header}>
      <a href={homeUrl} className={`${classes.logoLink} vbp-logo-hoverzone`}>
        <VbpLogo hoverVariant="blue" />
        <h1 className={classes.title}>Vlaams Biodiversiteitsportaal</h1>
      </a>
      <Group className={classes.navItems} gap={0}>
        {navLinks()}
      </Group>
      <Group className={classes.headerIcons} gap={0}>
        {icons}
      </Group>
      <Menu
        trigger="click"
        transitionProps={{ exitDuration: 0 }}
        position="bottom-end"
        offset={1}
        withinPortal
        closeOnItemClick={false}
      >
        <Menu.Target>
          <a
            href="#"
            className={`${classes.menuLink} ${classes.iconLink} ${classes.burger}`}
            onClick={(event) => event.preventDefault()}
          >
            <FontAwesomeIcon icon={faBars} />
          </a>
        </Menu.Target>
        <Menu.Dropdown className={`${classes.dropDown} ${classes.burgerDropDown}`}>
          <Stack className={classes.burgerNav} gap={0}>
            {navLinks(true)}
          </Stack>
          <BurgerIcons
            isAuthenticated={isAuthenticated || false}
            onAuthClick={onAuthClick}
          />
        </Menu.Dropdown>
      </Menu>
    </header>
  );
}
