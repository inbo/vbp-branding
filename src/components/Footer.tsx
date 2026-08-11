import { Flex, Group } from "@mantine/core";
import classes from "./Footer.module.css";

export function Footer({
  fullWidth = true,
}: {
  fullWidth?: boolean;
}): React.ReactElement {
  return (
    <footer className={classes.footer}>
      <Flex justify="space-between">
        <div className={classes.logo}>
          <img
            className={classes.vlaanderenLogo}
            src="https://assets.vlaanderen.be/image/upload/c_scale,q_auto:eco,w_1000/Vlaanderen_is_wetenschap_vol_xnbdq2"
            srcSet="https://assets.vlaanderen.be/image/upload/c_scale,q_auto:eco,w_320/Vlaanderen_is_wetenschap_vol_xnbdq2 320w, https://assets.vlaanderen.be/image/upload/c_scale,q_auto:eco,w_480/Vlaanderen_is_wetenschap_vol_xnbdq2 480w, https://assets.vlaanderen.be/image/upload/c_scale,q_auto:eco,w_960/Vlaanderen_is_wetenschap_vol_xnbdq2 960w, https://assets.vlaanderen.be/image/upload/c_scale,q_auto:eco,w_1420/Vlaanderen_is_wetenschap_vol_xnbdq2 1420w, https://assets.vlaanderen.be/image/upload/c_scale,q_auto:eco,w_1920/Vlaanderen_is_wetenschap_vol_xnbdq2 1920w"
            sizes="(max-width:500px) 50vw, 25vw"
          />
        </div>
        <div className={classes.center}>
          <div className={classes.title}>
            <h1>
              Het Vlaams Biodiversiteitsportaal is een officiële website van de
              Vlaamse overheid
            </h1>
            <div className={classes.subTitle}>
              <span>uitgegeven door</span>

              <a
                href="https://www.vlaanderen.be/inbo"
                target="_blank"
                rel="noopener noreferrer"
              >
                Instituut voor Natuur- en Bosonderzoek
              </a>
            </div>
          </div>
          <Group className={classes.links}>
            <a
              href="https://www.vlaanderen.be/inbo/privacyverklaring/"
              rel="noopener noreferrer"
            >
              Privacyverklaring
            </a>
            <a
              href="https://www.vlaanderen.be/inbo/cookiebeleid/"
              rel="noopener noreferrer"
            >
              Cookieverklaring
            </a>
            <a
              href="https://www.vlaanderen.be/inbo/toegankelijkheidsverklaring/"
              rel="noopener noreferrer"
            >
              Toegankelijkheidsverklaring
            </a>
            <a href="/pages/terms-of-use.html" rel="noopener noreferrer">
              Gebruiksvoorwaarden
            </a>
          </Group>
        </div>
        <Group className={classes.language}>
          <a
            href="https://www.vlaanderen.be/inbo"
            hrefLang="nl"
            lang="nl"
            target="_blank"
            rel="alternate"
          >
            nl
          </a>
          <a
            href="https://www.vlaanderen.be/inbo/en-gb/homepage/"
            hrefLang="en"
            lang="en"
            rel="alternate"
          >
            en
          </a>
        </Group>
      </Flex>
    </footer>
  );
}
