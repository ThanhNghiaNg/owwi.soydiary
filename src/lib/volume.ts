export const ML_PER_US_FLUID_OUNCE = 29.5735295625;

export function legacyOuncesToMilliliters(ounces: number) {
  return Math.round(ounces * ML_PER_US_FLUID_OUNCE);
}
