export const getNextNumberedId = (
  existingIds: Iterable<string>,
  prefix: string,
) => {
  const ids = new Set(existingIds);
  let index = 1;
  while (ids.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
};
