import SidebarLayout from '@/components/navigation/SidebarLayout';
import { SECTIONS } from '@/lib/navigation';

const exploreSection = SECTIONS.find((s) => s.key === 'explore')!;

export default function ExploreLayout() {
  return <SidebarLayout items={exploreSection.items!} />;
}
