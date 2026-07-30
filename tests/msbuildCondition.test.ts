import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '../src/model/msbuildCondition';

const PROPERTIES = { Configuration: 'Debug', Platform: 'AnyCPU' };

describe('evaluateCondition', () => {
  it('treats an empty condition as applying', () => {
    expect(evaluateCondition('', PROPERTIES)).toBe(true);
    expect(evaluateCondition('   ', PROPERTIES)).toBe(true);
  });

  it('resolves an equality over a known property', () => {
    expect(evaluateCondition(" '$(Configuration)' == 'Debug' ", PROPERTIES)).toBe(true);
    expect(evaluateCondition(" '$(Configuration)' == 'DebugWithLibs' ", PROPERTIES)).toBe(false);
  });

  it('resolves an inequality', () => {
    expect(evaluateCondition(" '$(Configuration)' != 'Release' ", PROPERTIES)).toBe(true);
    expect(evaluateCondition(" '$(Configuration)' != 'Debug' ", PROPERTIES)).toBe(false);
  });

  it('compares values case-insensitively, as MSBuild does', () => {
    expect(evaluateCondition(" '$(Configuration)' == 'DEBUG' ", PROPERTIES)).toBe(true);
    expect(evaluateCondition(" '$(Configuration)' == 'dEbUg' ", PROPERTIES)).toBe(true);
  });

  /**
   * MSBuild property *names* are case-insensitive too, which this lookup does not
   * reproduce. The consequence is a verdict of "cannot decide", so the reference is
   * kept: a known limitation that errs on the safe side.
   */
  it('does not resolve a property whose name differs in case', () => {
    expect(evaluateCondition(" '$(CONFIGURATION)' == 'Debug' ", PROPERTIES)).toBeUndefined();
  });

  it('resolves the combined Configuration|Platform form', () => {
    expect(evaluateCondition(" '$(Configuration)|$(Platform)' == 'Debug|AnyCPU' ", PROPERTIES)).toBe(
      true,
    );
    expect(
      evaluateCondition(" '$(Configuration)|$(Platform)' == 'Release|AnyCPU' ", PROPERTIES),
    ).toBe(false);
  });

  it('cannot decide when a property is unknown', () => {
    expect(evaluateCondition(" '$(TargetFramework)' == 'net10.0' ", PROPERTIES)).toBeUndefined();
  });

  it('cannot decide on property functions or boolean operators', () => {
    expect(evaluateCondition("Exists('Directory.Build.props')", PROPERTIES)).toBeUndefined();
    expect(
      evaluateCondition(" '$(Configuration)' == 'Debug' And '$(Platform)' == 'AnyCPU' ", PROPERTIES),
    ).toBeUndefined();
  });

  it('cannot decide on an expression that is not a comparison', () => {
    expect(evaluateCondition('$(SomeFlag)', PROPERTIES)).toBeUndefined();
  });
});
