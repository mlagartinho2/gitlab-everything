import { hash } from './format';

/** Hues for well-known labels; anything else gets a stable hue from its name. */
export const LABEL_HUE: Record<string, number> = {
  bug: 2, feature: 212, 'tech-debt': 36, security: 338, performance: 268, docs: 186, ux: 150, priority: 18,
};
export const labelHue = (scope: string) => LABEL_HUE[scope] ?? hash(scope) % 360;

export const ACCESS_LEVEL: Record<number, string> = {
  5: 'Minimal', 10: 'Guest', 15: 'Planner', 20: 'Reporter', 30: 'Developer', 40: 'Maintainer', 50: 'Owner',
};
export const ACCESS_TONE: Record<number, string> = { 50: 'acc', 40: 'info', 30: 'ok' };
