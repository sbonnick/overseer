import pageTemplate from "./assets/index.html" with { type: "text" };
import { defaultUiConfig } from "./ui-config";

export const page = String(pageTemplate)
  .trimEnd()
  .replace("__DASHBOARD_ICONS_BASE_URL__", JSON.stringify(defaultUiConfig.dashboardIconsBaseUrl));
