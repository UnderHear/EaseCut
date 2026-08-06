export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const areStringRecordsEqual = (
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
) => {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value]) => right[key] === value);
};
