import Hero from '@/components/Hero';
import PropertyShowcase from '@/components/home/PropertyShowcase';
import ValuePropositions from '@/components/home/ValuePropositions';
import PropertyCategories from '@/components/home/PropertyCategories';
import ServiceTiles from '@/components/home/ServiceTiles';
import NewProjects from '@/components/home/NewProjects';
import StatsCounter from '@/components/StatsCounter';
import Testimonials from '@/components/home/Testimonials';
import TrustBadges from '@/components/home/TrustBadges';
import CTASection from '@/components/CTASection';

export default function HomePage() {
  return (
    <>
      <Hero />
      <PropertyShowcase />
      <ValuePropositions />
      <PropertyCategories />
      <ServiceTiles />
      <NewProjects />
      <StatsCounter />
      <Testimonials />
      <TrustBadges />
      <CTASection />
    </>
  );
}
