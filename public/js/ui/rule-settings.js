import { defaultRules, squareName } from "/shared/game.js";
import { $ } from "./dom.js";

const flags = {
  presetKings: "rule-preset",
  kingFirst: "rule-king-first",
  noDropCheck: "rule-drop-check",
  noImmediateCapture: "rule-recent-capture",
  noImmediateMove: "rule-recent-move",
};
const numbers = {
  whiteKing: "rule-white-king",
  blackKing: "rule-black-king",
  noCheckPlies: "rule-no-check",
  swapPlies: "rule-swap",
};
export function initializeRuleFields() {
  for (const id of ["rule-white-king", "rule-black-king"])
    for (let i = 0; i < 64; i++) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = squareName(i);
      $(id).append(option);
    }
}
export function writeRuleFields(rules = defaultRules()) {
  for (const [key, id] of Object.entries(flags)) $(id).checked = rules[key];
  for (const [key, id] of Object.entries(numbers)) $(id).value = rules[key];
}
export function readRuleFields() {
  const rules = {};
  for (const [key, id] of Object.entries(flags)) rules[key] = $(id).checked;
  for (const [key, id] of Object.entries(numbers))
    rules[key] = Number($(id).value);
  return rules;
}
export function refreshRuleFields(editable) {
  $("king-positions").hidden = !$("rule-preset").checked;
  $("king-first-option").hidden = $("rule-preset").checked;
  $("rule-king-first").disabled = !editable || $("rule-preset").checked;
  for (const id of ["rule-white-king", "rule-black-king"])
    $(id).disabled = !editable || !$("rule-preset").checked;
  // Combined movement restriction subsumes capture restriction; retain both preferences.
}
