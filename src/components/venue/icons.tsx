import { createElement } from "react";
import {
  Accessibility,
  Activity,
  Car,
  Check,
  Dumbbell,
  Flame,
  Flower2,
  GlassWater,
  Lock,
  type LucideIcon,
  type LucideProps,
  Music,
  Shirt,
  ShowerHead,
  Swords,
  Waves,
  Wifi,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  gym: Dumbbell,
  yoga: Flower2,
  swimming: Waves,
  boxing: Swords,
  dance: Music,
  functional: Activity,
};

const AMENITY_ICONS: Record<string, LucideIcon> = {
  showers: ShowerHead,
  lockers: Lock,
  parking: Car,
  towels: Shirt,
  sauna: Flame,
  wifi: Wifi,
  water: GlassWater,
  "step-free": Accessibility,
};

export function categoryIcon(slug: string | null | undefined): LucideIcon {
  return (slug && CATEGORY_ICONS[slug]) || Activity;
}

export function amenityIcon(slug: string | null | undefined): LucideIcon {
  return (slug && AMENITY_ICONS[slug]) || Check;
}

/** Renders a category icon; avoids assigning a component to a local variable during render. */
export function CategoryIcon({ slug, ...props }: { slug: string | null | undefined } & LucideProps) {
  return createElement(categoryIcon(slug), props);
}
