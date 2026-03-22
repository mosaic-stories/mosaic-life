import SidebarLayout from '@/components/navigation/SidebarLayout';
import { SECTIONS } from '@/lib/navigation';

const myMosaicSection = SECTIONS.find((s) => s.key === 'my')!;

export default function MyMosaicLayout() {
  return <SidebarLayout items={myMosaicSection.items!} />;
}
