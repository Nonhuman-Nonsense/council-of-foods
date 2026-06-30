import type { ReactElement } from "react";

const CORDIS_GRANT_URL = "https://cordis.europa.eu/project/id/101069990";

/** External anchors for <Trans components={externalLinks} /> — hrefs stay in code. */
export const externalLinks = {
  nhn: <a href="https://nonhuman-nonsense.com" />,
  sos: <a href="https://studiootherspaces.net/" />,
  in4art: <a href="https://www.in4art.eu/" />,
  elliot: <a href="https://elliott.computer/" />,
  albin: <a href="https://www.polymorf.se/" />,
  hec: <a href="https://starts.eu/hungryecocities/" />,
  starts: <a href="https://starts.eu/" />,
  horizon: <a href={CORDIS_GRANT_URL} />,
  grant: <a href={CORDIS_GRANT_URL} />,
} as const satisfies Record<string, ReactElement>;
