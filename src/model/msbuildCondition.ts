export type PropertyValues = Readonly<Record<string, string>>;

/**
 * Evaluates the subset of MSBuild `Condition` expressions that guards project
 * references in practice: a single `==` or `!=` comparison over properties.
 *
 * Returns `undefined` when the expression is outside that subset. Callers must treat
 * that as "applies": dropping a real dependency produces a filter that does not load,
 * while keeping a spurious one is caught later by the intersection with the solution.
 * A full MSBuild evaluator is deliberately out of scope.
 */
export function evaluateCondition(raw: string, properties: PropertyValues): boolean | undefined {
  const condition = raw.trim();
  if (condition === '') {
    return true;
  }

  // Boolean operators and property functions are not interpreted.
  if (/\b(and|or)\b/i.test(condition) || /[A-Za-z]\s*\(/.test(condition)) {
    return undefined;
  }

  const comparison = /^(.*?)(==|!=)(.*)$/.exec(condition);
  if (comparison === null) {
    return undefined;
  }

  const left = expand(comparison[1]!, properties);
  const right = expand(comparison[3]!, properties);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  // MSBuild compares strings case-insensitively.
  const equal = left.toLowerCase() === right.toLowerCase();
  return comparison[2] === '==' ? equal : !equal;
}

/** Substitutes `$(Name)` occurrences; returns undefined when a property is unknown. */
function expand(operand: string, properties: PropertyValues): string | undefined {
  let value = operand.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  }

  let unresolved = false;
  const expanded = value.replace(/\$\(([^)]+)\)/g, (_match, name: string) => {
    const found = properties[name.trim()];
    if (found === undefined) {
      unresolved = true;
      return '';
    }
    return found;
  });

  return unresolved ? undefined : expanded;
}
