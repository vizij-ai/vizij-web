import { currentImportOutcomeFixtures } from "./current";
import { legacyImportOutcomeFixtures } from "./legacy";
import { malformedImportOutcomeFixtures } from "./malformed";

export {
  REQUIRED_IMPORT_FIXTURE_CLASSES,
  type ImportFixtureClass,
  type ImportOutcomeFixture,
} from "./types";

export const importOutcomeFixtureMatrix = [
  ...currentImportOutcomeFixtures,
  ...legacyImportOutcomeFixtures,
  ...malformedImportOutcomeFixtures,
].sort((left, right) => left.id.localeCompare(right.id));
