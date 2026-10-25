import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const LEVELS_PATH = path.resolve(process.cwd(), "../levels/levels.yaml");

export function loadLevels() {
  const raw = fs.readFileSync(LEVELS_PATH, "utf8");
  const parsed = yaml.load(raw);
  return parsed.levels;
}

export function getLevelById(id) {
  return loadLevels().find((lvl) => lvl.id === id);
}
