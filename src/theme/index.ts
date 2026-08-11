import { createTheme } from "@mantine/core";

// Theme override imports
import components from "./components";
import colors from "./colours";

import "./fonts.css";

export const theme = createTheme({
  // Colour configutation
  colors,
  // variantColorResolver,
  primaryColor: "vbp-primary",
  // Component customisation
  components,
  // Typography
  fontFamily: "flanders-sans",
});
