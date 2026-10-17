export const defaultRules = () => ({
  presetKings: true,
  whiteKing: 60,
  blackKing: 4,
  kingFirst: false,
  noCheckPlies: 0,
  noDropCheck: false,
  noImmediateCapture: false,
  noImmediateMove: false,
  swapPlies: 0,
});
export function validateRules(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("규칙 설정을 확인하세요.");
  const rules = { ...defaultRules(), ...input };
  for (const key of [
    "presetKings",
    "kingFirst",
    "noDropCheck",
    "noImmediateCapture",
    "noImmediateMove",
  ])
    if (typeof rules[key] !== "boolean")
      throw new Error("규칙 설정을 확인하세요.");
  for (const key of ["whiteKing", "blackKing"])
    if (!Number.isInteger(rules[key]) || rules[key] < 0 || rules[key] >= 64)
      throw new Error("킹 위치는 a1~h8 칸이어야 합니다.");
  if (rules.presetKings && rules.whiteKing === rules.blackKing)
    throw new Error("두 킹을 같은 칸에 놓을 수 없습니다.");
  for (const key of ["noCheckPlies", "swapPlies"])
    if (!Number.isInteger(rules[key]) || rules[key] < 0 || rules[key] > 100)
      throw new Error("초반 규칙은 0~100수로 설정하세요.");
  return Object.fromEntries(
    Object.keys(defaultRules()).map((key) => [key, rules[key]]),
  );
}
