import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Menu } from "@mantine/core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useIntl } from "react-intl";

import classes from "./Header.module.css";

interface MenuDropDownItemProps {
  id: string;
  url: string;
  icon: IconDefinition;
}
export function MenuDropDownItem({ id, url, icon }: MenuDropDownItemProps) {
  const intl = useIntl();
  return (
    <Menu.Item key={id} id={id} className={classes.menuDropDownItem}>
      <a href={url} className={classes.menuDropDownLink}>
        <FontAwesomeIcon
          className={classes.menuDropDownIcon}
          icon={icon}
        ></FontAwesomeIcon>
        {intl.formatMessage({ id: `header.login.${id}` })}
      </a>
    </Menu.Item>
  );
}
