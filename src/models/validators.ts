export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Mongoose `validate` option for a field that must be a whole number. */
export const integer = {
  validator: (value: number): boolean => Number.isInteger(value),
  message: '{PATH} must be an integer',
};

/** Mongoose options for a `#rrggbb` color field with a default. */
export function colorField(defaultColor: string) {
  return {
    type: String,
    default: defaultColor,
    trim: true,
    match: [HEX_COLOR, '{PATH} must be a hex color like #6366f1'] as [RegExp, string],
  };
}
