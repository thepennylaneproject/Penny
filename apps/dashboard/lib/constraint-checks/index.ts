/**
 * Constraint checks export index
 */

export * from "./easy";
export * from "./moderate";
export * from "./complex";

export async function runAllConstraintChecks(projectPath: string) {
  // Will orchestrate running all checks
  const easyResults = await import("./easy").then((m) =>
    m.runEasyChecks(projectPath)
  );

  const moderateResults = await import("./moderate").then((m) =>
    m.runModerateChecks(projectPath)
  );

  const complexResults = await import("./complex").then((m) =>
    m.runComplexChecks(projectPath)
  );

  return {
    easy: easyResults,
    moderate: moderateResults,
    complex: complexResults,
  };
}
