'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFeaturedProjects, getMediaUrl, type Project } from '@/lib/api';

export default function NewProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await getFeaturedProjects(6);
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400">Loading projects...</p>
          </div>
        </div>
      </section>
    );
  }

  if (projects.length === 0) {
    return null; // Don't show section if no projects
  }

  return (
    <section className="py-16 bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            New Projects
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Explore upcoming and under-construction projects from trusted builders
          </p>
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>

        {/* View All Button */}
        <div className="text-center">
          <Link
            href="/properties?tab=projects"
            className="inline-block px-8 py-3 bg-blue-600 dark:bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
          >
            View All Projects
          </Link>
        </div>
      </div>
    </section>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const firstImage = getMediaUrl(project.media?.find(m => m.media_type === 'IMAGE')?.media_url);
  const minPrice = project.units && project.units.length > 0
    ? Math.min(...project.units.map(u => u.price_min))
    : null;
  const maxPrice = project.units && project.units.length > 0
    ? Math.max(...project.units.map(u => u.price_max || u.price_min))
    : null;
  const priceUnit = project.units[0]?.price_unit || 'Lakh';

  const configurations = project.units && project.units.length > 0
    ? [...new Set(project.units.map(u => u.configuration))].sort().join(', ')
    : 'Various';

  return (
    <Link href={`/projects/${project.id}`}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow">
        {/* Image */}
        <div className="relative h-48 bg-gray-200 dark:bg-gray-700">
          {firstImage ? (
            <img
              src={firstImage}
              alt={project.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
            </div>
          )}
          {/* RERA Badge */}
          {project.rera_number && (
            <div className="absolute top-3 right-3 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
              RERA
            </div>
          )}
          {/* Status Badge */}
          <div className="absolute bottom-3 left-3 bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-semibold uppercase">
            {project.project_status.replace('_', ' ')}
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Title */}
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 line-clamp-1">
            {project.name}
          </h3>

          {/* Location */}
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {project.locality}, {project.city}
          </p>

          {/* Price Range */}
          {minPrice && (
            <div className="mb-3">
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                ₹{minPrice}
                {maxPrice && maxPrice !== minPrice && ` - ${maxPrice}`} {priceUnit}
              </span>
            </div>
          )}

          {/* Configurations */}
          <div className="flex items-center justify-between text-sm mb-3">
            <div className="flex items-center text-gray-700 dark:text-gray-300">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="font-medium">{configurations}</span>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
            {project.short_description}
          </p>

          {/* Builder */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              By <span className="font-semibold text-gray-700 dark:text-gray-300">{project.owner.contact.name}</span>
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
