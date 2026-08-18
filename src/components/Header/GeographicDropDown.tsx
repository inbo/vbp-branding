import { Divider, Menu } from "@mantine/core";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBook,
  faBug,
  faBullseye,
  faCaretDown,
  faCircleInfo,
  faClapperboard,
  faFileContract,
  faLocationCrosshairs,
  faMap,
  faQuestionCircle,
  faRightFromBracket,
  faRightToBracket,
  faSignsPost,
  faSquarePollVertical,
  faTrowelBricks,
  faUser,
  faUserLock,
} from "@fortawesome/free-solid-svg-icons";
import classes from "./Header.module.css";
import { MenuDropDownItem } from "./MenuDropDownItem";

interface GeographicDownProps {}

export function GeographicDropDown({}: GeographicDownProps) {
  return (
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
      <Menu.Dropdown className={`${classes.dropDown}`}>
        {[
          {
            id: "spatial-hub",
            url: "/spatial-hub/",
            icon: faMap,
          },
          {
            id: "regions",
            url: "/regions/",
            icon: faSignsPost,
          },
          {
            id: "explore-your-area",
            url: "/biocache-hub/explore",
            icon: faLocationCrosshairs,
          },
        ].map((item, i) =>
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
