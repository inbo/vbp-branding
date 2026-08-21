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
  /** render as a plain row (outside a Menu context, e.g. inside an Accordion) */
  plain?: boolean;
}
export function MenuDropDownItem({
  id,
  url,
  onClick,
  icon,
  className = "",
  plain = false,
}: MenuDropDownItemProps) {
  const intl = useIntl();
  const link = (
    <a href={url} onClick={onClick} className={classes.menuDropDownLink}>
      <FontAwesomeIcon className={classes.menuDropDownIcon} icon={icon} />
      {intl.formatMessage({ id: `header.login.${id}` })}
    </a>
  );
  if (plain) {
    return (
      <div id={id} className={`${className} ${classes.menuDropDownItem}`}>
        {link}
      </div>
    );
  }
  // ponytail: <a> without href when it's an action; keeps one code path
  return (
    <Menu.Item
      key={id}
      id={id}
      className={`${className} ${classes.menuDropDownItem}`}
    >
      {link}
    </Menu.Item>
  );
}
