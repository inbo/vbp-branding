import { Divider, Menu } from "@mantine/core";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBook,
  faBug,
  faBullseye,
  faCircleInfo,
  faClapperboard,
  faFileContract,
  faQuestionCircle,
  faSquarePollVertical,
  faTrowelBricks,
  faUserLock,
} from "@fortawesome/free-solid-svg-icons";
import classes from "./Header.module.css";
import { MenuDropDownItem } from "./MenuDropDownItem";

export const HELP_ITEMS = [
    {
      id: "help-overview",
      url: "/pages/handleiding.html",
      icon: faCircleInfo,
    },
    {
      id: "help-access",
      url: "/pages/toegang.html",
      icon: faUserLock,
    },
    {
      id: "help-wiki",
      url: "https://github.com/inbo/vlaams-biodiversiteitsportaal/wiki",
      icon: faBook,
    },
    null,
    {
      id: "help-challenges",
      url: "/pages/VBP_challenges.html",
      icon: faBullseye,
    },
    {
      id: "help-intro-videos",
      url: "/pages/VBP_introductiefilmpjes.html",
      icon: faClapperboard,
    },
    {
      id: "help-survey",
      url: "/pages/survey.html",
      icon: faSquarePollVertical,
    },
    {
      id: "help-workshop",
      url: "/pages/VBP_workshop.html",
      icon: faTrowelBricks,
    },
    null,
    {
      id: "help-report-problems",
      url: "/pages/VBP_testen.html",
      icon: faBug,
    },
    {
      id: "help-terms-of-use",
      url: "/pages/terms-of-use.html",
      icon: faFileContract,
    },
  ];

export function HelpDropDown() {
  return (
    <Menu
      trigger="hover"
      transitionProps={{ exitDuration: 0 }}
      withinPortal
      position="bottom-start"
      offset={1}
    >
      <Menu.Target>
        <a
          href="#"
          className={`${classes.menuLink} ${classes.iconLink}`}
          onClick={(event) => event.preventDefault()}
        >
          <FontAwesomeIcon icon={faQuestionCircle} />
        </a>
      </Menu.Target>
      <Menu.Dropdown
        className={`${classes.dropDown} ${classes.LanguageDropDown}`}
      >
        {HELP_ITEMS.map((item, i) =>
          item ? (
            <MenuDropDownItem key={item.id} {...item} />
          ) : (
            <Divider key={`divider-${i}`} />
          ),
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
