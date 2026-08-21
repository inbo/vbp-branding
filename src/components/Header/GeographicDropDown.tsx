import { Accordion, Divider, Menu } from "@mantine/core";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faLocationCrosshairs,
  faMap,
  faSignsPost,
} from "@fortawesome/free-solid-svg-icons";
import classes from "./Header.module.css";
import { MenuDropDownItem } from "./MenuDropDownItem";

const ITEMS = [
  { id: "spatial-hub", url: "/spatial-hub/", icon: faMap },
  { id: "regions", url: "/regions/", icon: faSignsPost },
  {
    id: "explore-your-area",
    url: "/biocache-hub/explore",
    icon: faLocationCrosshairs,
  },
];

interface GeographicDownProps {
  /** render as an accordion row instead of a hover dropdown (burger menu) */
  accordion?: boolean;
}

export function GeographicDropDown({ accordion }: GeographicDownProps) {
  if (accordion) {
    return (
      <Accordion chevronPosition="right" className={classes.geoAccordion}>
        <Accordion.Item value="geographic">
          <Accordion.Control className={classes.menuLink}>
            Geografisch
          </Accordion.Control>
          <Accordion.Panel>
            {ITEMS.map((item) => (
              <MenuDropDownItem key={item.id} plain {...item} />
            ))}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    );
  }

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
      <Menu.Dropdown className={classes.dropDown}>
        {ITEMS.map((item) => (
          <MenuDropDownItem key={item.id} {...item} />
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
