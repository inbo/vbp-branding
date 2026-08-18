import { Center, Menu } from "@mantine/core";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons";
import { useVBPLocale, SUPPORTED_LOCALE } from "../I18n/VBPIntlProvider";
import classes from "./Header.module.css";

export function LanguageDropDown() {
  const [locale, setLocale] = useVBPLocale();
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
          {locale}
        </a>
      </Menu.Target>
      <Menu.Dropdown className={[classes.dropDown, classes.LanguageDropDown]}>
        <Menu.Item onClick={() => setLocale(SUPPORTED_LOCALE.NL)}>
          Nederlands
        </Menu.Item>
        <Menu.Item onClick={() => setLocale(SUPPORTED_LOCALE.EN)}>
          English
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
