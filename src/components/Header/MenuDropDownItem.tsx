import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Menu } from "@mantine/core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useIntl } from "react-intl";
import { MouseEventHandler } from "react";

import classes from "./Header.module.css";

interface MenuDropDownItemProps {
  id: string;
  url?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  icon: IconDefinition;
  className?: string;
}
export function MenuDropDownItem({
  id,
  url,
  onClick,
  icon,
  className = "",
}: MenuDropDownItemProps) {
  const intl = useIntl();
  // ponytail: <a> without href when it's an action; keeps one code path
  return (
    <Menu.Item
      key={id}
      id={id}
      className={`${className} ${classes.menuDropDownItem}`}
    >
      <a href={url} onClick={onClick} className={classes.menuDropDownLink}>
        <FontAwesomeIcon
          className={classes.menuDropDownIcon}
          icon={icon}
        ></FontAwesomeIcon>
        {intl.formatMessage({ id: `header.login.${id}` })}
      </a>
    </Menu.Item>
  );
}
