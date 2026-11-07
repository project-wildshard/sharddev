import { decisionBindingMap as resolveBindings, type DecisionRegistries as Registries, type DecisionBindingMap as BindingMap } from '@wildshard/format/decisionBindings';
import type { DecisionScriptRow } from '@wildshard/format/decisionScripts';

/** Authoritative registries shared with the production resolver. */
export type DecisionRegistries = Registries;
/** Generated labels and numeric constants use the format's defining map. */
export type DecisionBindingMap = BindingMap;
/** SDK compatibility entry; allocation and refusal live in the renderer-free format. */
export function decisionBindingMap(row: DecisionScriptRow, registries: DecisionRegistries): DecisionBindingMap {
  return resolveBindings(row, registries);
}
