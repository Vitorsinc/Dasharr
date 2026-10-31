import { allowedItems, itemKey, moveItem, profileProblems, setAllowed, setFormatScore } from "./qualityProfile";
import { customFormatToJson, parseCustomFormatJson } from "@/api/arrManage";
import { profile } from "@/test/fixtures";

test("allowedItems va de mejor a peor y usa el id del grupo", () => {
  expect(allowedItems(profile()).map(itemKey)).toEqual([7, 1000]);
});

test("setAllowed mueve el límite si deja de estar permitido y marca las calidades del grupo", () => {
  const p = setAllowed(profile(), 7, false);
  expect(p.cutoff).toBe(1000);
  const g = setAllowed(p, 1000, false);
  expect(g.items[1].items.every((i) => !i.allowed)).toBe(true);
  expect(profileProblems(g)).toEqual(["noneAllowed"]);
  expect(profileProblems({ ...profile(), name: " " })).toEqual(["name"]);
  expect(profileProblems({ ...profile(), cutoff: 19 })).toEqual(["cutoff"]);
});

test("moveItem sube y baja según la lista que se ve (al revés que items)", () => {
  // Subir Bluray-2160p no hace nada: ya es el primero.
  expect(moveItem(profile(), 19, -1).items.map(itemKey)).toEqual([1, 1000, 7, 19]);
  // Bajar Bluray-1080p lo pone por debajo del grupo de 720p.
  expect(moveItem(profile(), 7, 1).items.map(itemKey)).toEqual([1, 7, 1000, 19]);
  expect(moveItem(profile(), 1000, -1).items.map(itemKey)).toEqual([1, 7, 1000, 19]);
});

test("setFormatScore cambia solo ese formato", () => {
  expect(setFormatScore(profile(), 1, -50).formatItems).toEqual([
    { format: 1, name: "x265", score: -50 },
    { format: 2, name: "HDR", score: 10 },
  ]);
});

test("parseCustomFormatJson acepta los campos como objeto (TRaSH) o como lista (API)", () => {
  const trash = parseCustomFormatJson(
    JSON.stringify({
      trash_id: "abc",
      name: " x265 (HD) ",
      includeCustomFormatWhenRenaming: false,
      specifications: [{ name: "x265", implementation: "ReleaseTitleSpecification", negate: false, required: true, fields: { value: "[xh]\\.?265" } }],
    }),
  );
  expect(trash).toEqual({
    name: "x265 (HD)",
    includeCustomFormatWhenRenaming: false,
    specifications: [
      { name: "x265", implementation: "ReleaseTitleSpecification", negate: false, required: true, fields: [{ name: "value", value: "[xh]\\.?265" }] },
    ],
  });
  const roundTrip = parseCustomFormatJson(customFormatToJson({ ...trash }));
  expect(roundTrip).toEqual(trash);
  expect(() => parseCustomFormatJson("{")).toThrow("invalid-json");
  expect(() => parseCustomFormatJson('{"specifications":[]}')).toThrow("missing-name");
  expect(() => parseCustomFormatJson('{"name":"x"}')).toThrow("missing-specs");
});
