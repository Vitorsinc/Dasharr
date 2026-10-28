import { versionLabel } from "./version";

test("versionLabel distingue versiones publicadas de builds de desarrollo", () => {
  expect(versionLabel("0.2.0", "")).toBe("v0.2.0");
  expect(versionLabel("0.2.0", "a1b2c3d")).toBe("v0.2.0 · dev a1b2c3d");
});
