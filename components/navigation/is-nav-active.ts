/** True when pathname matches this item and no other nav link has a longer, more specific href that matches. */
export function isNavActive(
  pathname: string | null,
  itemHref: string,
  items: readonly { href: string }[]
): boolean {
  if (!pathname?.startsWith(itemHref)) return false
  const moreSpecificMatch = items.some(
    (other) =>
      other.href !== itemHref &&
      other.href.length > itemHref.length &&
      pathname.startsWith(other.href)
  )
  return !moreSpecificMatch
}
