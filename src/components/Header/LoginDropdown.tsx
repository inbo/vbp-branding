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
interface LoginDropDownProps {
  isAuthenticated: boolean;
  onAuthClick: React.MouseEventHandler<HTMLButtonElement>;
}
export function LoginDropDown({
  isAuthenticated,
  onAuthClick,
}: LoginDropDownProps) {
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
          className={`${classes.menuLink} ${classes.LanguageDropDownTarget}`}
          onClick={(event) => event.preventDefault()}
        >
          {isAuthenticated ? (
            <FontAwesomeIcon className={classes.loginUserIcon} icon={faUser} />
          ) : (
            <FontAwesomeIcon
              className={classes.loginUserIcon}
              icon={faUserXmark}
            />
          )}
        </a>
      </Menu.Target>
      <Menu.Dropdown
        className={`${classes.dropDown} ${classes.LanguageDropDown}`}
      >
        {isAuthenticated ? (
          <>
            {[
              {
                id: "my-profile",
                url: "/my-profile.html",
                icon: faIdBadge,
              },
              null,
              {
                id: "my-lists",
                url: "/poc/species-lists/",
                icon: faListCheck,
              },
              {
                id: "my-annotation",
                url: "/poc/species-lists/",
                icon: faFlag,
              },
              {
                id: "my-alerts",
                url: "/alerts/",
                icon: faBell,
              },
              {
                id: "my-analysis",
                url: "/spatial-hub/?tool=log",
                icon: faMap,
              },
              null,
              {
                id: "logout",
                onClick: onAuthClick,
                icon: faRightFromBracket,
              },
            ].map((item, i) =>
              item ? (
                <MenuDropDownItem key={item.id} {...item} />
              ) : (
                <Divider key={`divider-${i}`} />
              ),
            )}
          </>
        ) : (
          <MenuDropDownItem
            id="login"
            onClick={onAuthClick}
            icon={faRightToBracket}
          />
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
