"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; icon: string; label: string };

/** Menü, bulunduğunuz yeri gösterir.
 *
 *  The sidebar used to render every link the same, so the only way to know
 *  which screen was open was to read the page. A student card counts as the
 *  student list, because that is where it was opened from. */
export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const active = (href: string) => href === "/workspace"
    ? path === "/workspace"
    : path === href || path.startsWith(`${href}/`);
  return <nav aria-label="Ana menü">{items.map(i =>
    <Link key={i.href} href={i.href} className={active(i.href) ? "on" : undefined}
      aria-current={active(i.href) ? "page" : undefined}>
      <span className="nav-ico" aria-hidden="true">{i.icon}</span>{i.label}
    </Link>)}</nav>;
}
