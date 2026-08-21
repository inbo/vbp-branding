import { useState } from "react";
import { Collapse, Group } from "@mantine/core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faQuestionCircle,
  faUser,
  faUserXmark,
} from "@fortawesome/free-solid-svg-icons";

import classes from "./Header.module.css";
import { SearchInput } from "./SearchInput";
import { MenuDropDownItem } from "./MenuDropDownItem";
import { HELP_ITEMS } from "./HelpDropDown";
import { loginItems } from "./LoginDropdown";
import { useVBPLocale, SUPPORTED_LOCALE } from "../I18n/VBPIntlProvider";

interface BurgerIconsProps {
  isAuthenticated: boolean;
  onAuthClick?: React.MouseEventHandler<HTMLButtonElement>;
}

/** Icon row of the burger menu: tapping an icon expands its panel below. */
export function BurgerIcons({ isAuthenticated, onAuthClick }: BurgerIconsProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [locale, setLocale] = useVBPLocale();

  const panels: Record<string, React.ReactNode> = {
    help: HELP_ITEMS.filter(Boolean).map((item) => (
      <MenuDropDownItem key={item!.id} plain {...item!} />
    )),
    login: loginItems(isAuthenticated, onAuthClick)
      .filter(Boolean)
      .map((item) => <MenuDropDownItem key={item!.id} plain {...item!} />),
    language: [
      { value: SUPPORTED_LOCALE.NL, label: "Nederlands" },
      { value: SUPPORTED_LOCALE.EN, label: "English" },
    ].map(({ value, label }) => (
      <div
        key={label}
        className={classes.menuDropDownItem}
        onClick={() => setLocale(value)}
      >
        <a className={classes.menuDropDownLink}>{label}</a>
      </div>
    )),
  };

  const toggle = (id: string) => setOpen((prev) => (prev === id ? null : id));

  return (
    <>
      <Group
        className={classes.burgerIcons}
        gap={0}
        grow
        wrap="nowrap"
      >
        <SearchInput expandRight />
        <a
          className={`${classes.menuLink} ${classes.iconLink}`}
          onClick={() => toggle("help")}
        >
          <FontAwesomeIcon icon={faQuestionCircle} />
        </a>
        <a
          className={`${classes.menuLink} ${classes.iconLink} ${classes.LanguageDropDownTarget} ${isAuthenticated ? classes.loggedIn : classes.loggedOut}`}
          onClick={() => toggle("login")}
        >
          <FontAwesomeIcon icon={isAuthenticated ? faUser : faUserXmark} />
        </a>
        <a
          className={`${classes.menuLink} ${classes.iconLink} ${classes.LanguageDropDownTarget}`}
          onClick={() => toggle("language")}
        >
          {locale}
        </a>
      </Group>
      {Object.keys(panels).map((id) => (
        <Collapse key={id} in={open === id}>
          {/* ponytail: border on an inner div so it's clipped when collapsed */}
          <div className={classes.burgerPanel}>{panels[id]}</div>
        </Collapse>
      ))}
    </>
  );
}
