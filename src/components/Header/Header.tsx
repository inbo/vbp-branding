"use client";

import React, { useEffect, useState } from "react";
import logo from "../../static/logo.png";
import logoHover from "../../static/logo-hover.png";
import {
  Accordion,
  Box,
  Button,
  Center,
  Container,
  Drawer,
  Flex,
  Group,
  Menu,
  Stack,
  Tabs,
  TabsList,
  TabsTab,
  Text,
  UnstyledButton,
  useMantineColorScheme,
} from "@mantine/core";

import classes from "./Header.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faChevronDown,
  faLocationCrosshairs,
  faMagnifyingGlass,
  faMap,
  faQuestionCircle,
  faSignsPost,
  faUserXmark,
} from "@fortawesome/free-solid-svg-icons";
import { LanguageDropDown } from "./LanguageDropDown";

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
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    new Image().src = logoHover;
  }, []);
  return (
    <header className={classes.header}>
      <a className={classes.logoLink} href="/">
        <img
          className={classes.logo}
          src={hovered ? logoHover : logo}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />
      </a>
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
        <Menu
          trigger="hover"
          transitionProps={{ exitDuration: 0 }}
          position="bottom-start"
          offset={1}
          withinPortal
        >
          <Menu.Target>
            <a
              href="https://natuurdata.inbo.be/spatial-hub/"
              className={classes.menuLink}
              onClick={(event) => event.preventDefault()}
            >
              <span className={classes.linkLabel}>Geografisch</span>
              <FontAwesomeIcon className={classes.caret} icon={faCaretDown} />
            </a>
          </Menu.Target>
          <Menu.Dropdown className={classes.dropDown}>
            <Menu.Item>
              <FontAwesomeIcon icon={faMap} />
              Geografisch Portaal
            </Menu.Item>
            <Menu.Item>
              <FontAwesomeIcon icon={faSignsPost} />
              Regio's
            </Menu.Item>
            <Menu.Item>
              <FontAwesomeIcon icon={faLocationCrosshairs} />
              Verken je omgeving
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Group gap={0}>
        <a className={`${classes.menuLink} ${classes.iconLink}`} href="">
          <FontAwesomeIcon icon={faMagnifyingGlass} />
        </a>
        <a className={`${classes.menuLink} ${classes.iconLink}`} href="">
          <FontAwesomeIcon icon={faQuestionCircle} />
        </a>
        <a className={`${classes.menuLink} ${classes.iconLink}`} href="">
          <FontAwesomeIcon icon={faUserXmark} />
        </a>
        <LanguageDropDown className={classes.menuLink} />
      </Group>
    </header>
  );
}
