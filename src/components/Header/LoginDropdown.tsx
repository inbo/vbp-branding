import { Divider, Menu } from "@mantine/core";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faFlag,
  faIdBadge,
  faListCheck,
  faMap,
  faRightFromBracket,
  faRightToBracket,
  faUser,
  faUserXmark,
} from "@fortawesome/free-solid-svg-icons";
import classes from "./Header.module.css";

import { MenuDropDownItem } from "./MenuDropDownItem";
import { useVBPAuth } from "../auth/VBPAuthProvider";

const loginItems = (
  isAuthenticated: boolean,
  onAuthClick: React.MouseEventHandler<HTMLButtonElement>,
) =>
  isAuthenticated
    ? [
        { id: "my-profile", url: "/my-profile.html", icon: faIdBadge },
        null,
        { id: "my-lists", url: "/poc/species-lists/", icon: faListCheck },
        { id: "my-annotation", url: "/poc/species-lists/", icon: faFlag },
        { id: "my-alerts", url: "/alerts/", icon: faBell },
        { id: "my-analysis", url: "/spatial-hub/?tool=log", icon: faMap },
        null,
        { id: "logout", onClick: onAuthClick, icon: faRightFromBracket },
      ]
    : [{ id: "login", onClick: onAuthClick, icon: faRightToBracket }];

/**
 * Auth state and the login/logout menu entries, straight from the auth context.
 * Must be rendered inside a `VBPAuthProviderWrapper`.
 */
export function useLoginItems() {
  const { isAuthenticated, login, logout } = useVBPAuth();
  return {
    isAuthenticated,
    items: loginItems(isAuthenticated, () =>
      void (isAuthenticated ? logout() : login()),
    ),
  };
}

export function LoginDropDown() {
  const { isAuthenticated, items } = useLoginItems();
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
          className={`${classes.menuLink} ${classes.iconLink} ${classes.LanguageDropDownTarget} ${isAuthenticated ? classes.loggedIn : classes.loggedOut}`}
          onClick={(event) => event.preventDefault()}
        >
          <FontAwesomeIcon
            className={classes.loginUserIcon}
            icon={isAuthenticated ? faUser : faUserXmark}
          />
        </a>
      </Menu.Target>
      <Menu.Dropdown
        className={`${classes.dropDown} ${classes.LanguageDropDown}`}
      >
        {items.map((item, i) =>
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
