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

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faChevronDown,
  faLocationCrosshairs,
  faMap,
  faQuestionCircle,
  faSignsPost,
  faUserXmark,
} from "@fortawesome/free-solid-svg-icons";
interface LanguageDropDownProps {}

import classes from "./Header.module.css";

export function LanguageDropDown({}: LanguageDropDownProps) {
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
          className={classes.menuLink}
          onClick={(event) => event.preventDefault()}
        >
          <Center>
            <span>NL</span>
            <FontAwesomeIcon className={classes.caret} icon={faCaretDown} />
          </Center>
        </a>
      </Menu.Target>
      <Menu.Dropdown className={[classes.dropDown, classes.LanguageDropDown]}>
        <Menu.Item>Nederlands</Menu.Item>
        <Menu.Item>English</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
