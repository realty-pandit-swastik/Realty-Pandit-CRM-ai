'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { MapPin, Building2, Calendar, FileText, ChevronLeft, ChevronRight, Share2, Phone, Mail, X, CheckCircle2, Home, Ruler, BadgeCheck } from 'lucide-react';
import Link from 'next/link';
import { COMPANY_PHONE_TEL } from '@/lib/constants';
import { getProjectDetail, getSimilarProjects, submitProjectEnquiry, getMediaUrl, type Project } from '@/lib/api';

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    const [project, setProject] = useState<Project | null>(null);
    const [similarProjects, setSimilarProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [showEnquiryModal, setShowEnquiryModal] = useState(false);
    const [enquirySubmitted, setEnquirySubmitted] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        message: ''
    });

    useEffect(() => {
        loadProjectData();
    }, [projectId]);

    const loadProjectData = async () => {
        setLoading(true);
        try {
            const projectData = await getProjectDetail(projectId);
            setProject(projectData);

            // Load similar projects after getting project data
            if (projectData) {
                const similarData = await getSimilarProjects(
                    projectData.city,
                    projectData.project_type,
                    projectData.id
                );
                setSimilarProjects(similarData);
            }
        } catch (error) {
            console.error('Failed to load project:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEnquirySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await submitProjectEnquiry({
                projectId,
                ...formData
            });
            setEnquirySubmitted(true);
            setTimeout(() => {
                setShowEnquiryModal(false);
                setEnquirySubmitted(false);
                setFormData({ name: '', phone: '', email: '', message: '' });
            }, 2000);
        } catch (error) {
            console.error('Failed to submit enquiry:', error);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-500 dark:text-slate-400">Loading project details...</p>
                </div>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20 flex items-center justify-center">
                <div className="text-center">
                    <Building2 className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-200 mb-2">Project Not Found</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">The project you&apos;re looking for doesn&apos;t exist.</p>
                    <Link href="/properties?tab=projects" className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors inline-block">
                        Browse All Projects
                    </Link>
                </div>
            </div>
        );
    }

    const images = project.media?.filter(m => m.media_type === 'IMAGE') || [];
    const floorPlans = project.media?.filter(m => m.media_type === 'FLOOR_PLAN') || [];
    const videos = project.media?.filter(m => m.media_type === 'VIDEO') || [];

    const minPrice = project.units?.length > 0 ? Math.min(...project.units.map(u => u.price_min)) : null;
    const maxPrice = project.units?.length > 0 ? Math.max(...project.units.map(u => u.price_max || u.price_min)) : null;
    const priceUnit = project.units[0]?.price_unit || 'Lakh';

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20">
            {/* Breadcrumb */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-4">
                <div className="max-w-7xl mx-auto px-4">
                    <nav className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Home</Link>
                        <ChevronRight className="w-4 h-4" />
                        <Link href="/properties?tab=projects" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Projects</Link>
                        <ChevronRight className="w-4 h-4" />
                        <span className="text-slate-900 dark:text-white font-medium truncate">{project.name}</span>
                    </nav>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column - Images & Details */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Image Gallery */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-md border border-slate-100 dark:border-slate-800">
                            {/* Main Image */}
                            <div className="relative h-96 bg-slate-200 dark:bg-slate-700">
                                {images.length > 0 ? (
                                    <img
                                        src={getMediaUrl(images[selectedImageIndex]?.media_url)}
                                        alt={project.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full">
                                        <Building2 className="w-24 h-24 text-slate-300 dark:text-slate-600" />
                                    </div>
                                )}

                                {/* Navigation Arrows */}
                                {images.length > 1 && (
                                    <>
                                        <button
                                            onClick={() => setSelectedImageIndex((selectedImageIndex - 1 + images.length) % images.length)}
                                            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 dark:bg-slate-800/90 rounded-full flex items-center justify-center hover:bg-white dark:hover:bg-slate-800 transition-colors shadow-lg"
                                        >
                                            <ChevronLeft className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                                        </button>
                                        <button
                                            onClick={() => setSelectedImageIndex((selectedImageIndex + 1) % images.length)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 dark:bg-slate-800/90 rounded-full flex items-center justify-center hover:bg-white dark:hover:bg-slate-800 transition-colors shadow-lg"
                                        >
                                            <ChevronRight className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                                        </button>
                                    </>
                                )}

                                {/* RERA Badge */}
                                {project.rera_number && (
                                    <div className="absolute top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg flex items-center gap-2">
                                        <BadgeCheck className="w-4 h-4" />
                                        RERA Approved
                                    </div>
                                )}
                            </div>

                            {/* Thumbnails */}
                            {images.length > 1 && (
                                <div className="p-4 flex gap-2 overflow-x-auto">
                                    {images.map((img, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setSelectedImageIndex(idx)}
                                            className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                                                idx === selectedImageIndex
                                                    ? 'border-blue-600 ring-2 ring-blue-200 dark:ring-blue-900'
                                                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                            }`}
                                        >
                                            <img src={getMediaUrl(img.media_url)} alt="" className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Project Info */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-md border border-slate-100 dark:border-slate-800">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">{project.name}</h1>
                                    <p className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                        <MapPin className="w-4 h-4 flex-shrink-0" />
                                        {project.locality}, {project.city}
                                    </p>
                                </div>
                                <button className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                    <Share2 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                                </button>
                            </div>

                            {/* Price */}
                            {minPrice && (
                                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900">
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Price Range</p>
                                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                                        ₹{minPrice}{maxPrice && maxPrice !== minPrice && ` - ${maxPrice}`} {priceUnit}
                                    </p>
                                </div>
                            )}

                            {/* Quick Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                    <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Status</div>
                                    <div className="font-semibold text-slate-900 dark:text-white capitalize">
                                        {project.project_status.replace('_', ' ')}
                                    </div>
                                </div>
                                <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                    <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Type</div>
                                    <div className="font-semibold text-slate-900 dark:text-white capitalize">
                                        {project.project_type}
                                    </div>
                                </div>
                                {project.possession_date && (
                                    <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Possession</div>
                                        <div className="font-semibold text-slate-900 dark:text-white">
                                            {new Date(project.possession_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                        </div>
                                    </div>
                                )}
                                {project.rera_number && (
                                    <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">RERA No.</div>
                                        <div className="font-semibold text-slate-900 dark:text-white text-xs">
                                            {project.rera_number}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Description */}
                            <div className="mb-6">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">About Project</h2>
                                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                                    {project.long_description || project.short_description}
                                </p>
                            </div>

                            {/* Builder Info */}
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Developed By</p>
                                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                                    {project.owner.contact.name}
                                </p>
                            </div>
                        </div>

                        {/* Units/Configurations */}
                        {project.units && project.units.length > 0 && (
                            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-md border border-slate-100 dark:border-slate-800">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <Home className="w-5 h-5" />
                                    Available Configurations
                                </h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-slate-200 dark:border-slate-700">
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Configuration</th>
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Area (sq.ft)</th>
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Price</th>
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Available Units</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {project.units.map((unit, idx) => (
                                                <tr key={idx} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                                    <td className="py-3 px-4">
                                                        <span className="font-medium text-slate-900 dark:text-white">{unit.configuration}</span>
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                                                        {unit.area_min}
                                                        {unit.area_max && unit.area_max !== unit.area_min && ` - ${unit.area_max}`}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                                                            ₹{unit.price_min}
                                                            {unit.price_max && unit.price_max !== unit.price_min && ` - ${unit.price_max}`} {unit.price_unit}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                                                        {unit.available_units || 'Contact for details'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Floor Plans */}
                        {floorPlans.length > 0 && (
                            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-md border border-slate-100 dark:border-slate-800">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Floor Plans</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {floorPlans.map((plan, idx) => (
                                        <div key={idx} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                            <img src={getMediaUrl(plan.media_url)} alt={`Floor Plan ${idx + 1}`} className="w-full h-64 object-contain bg-slate-50 dark:bg-slate-800" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Map */}
                        {project.google_map_link && (
                            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-md border border-slate-100 dark:border-slate-800">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Location</h2>
                                <div className="aspect-video rounded-lg overflow-hidden">
                                    <iframe
                                        src={project.google_map_link}
                                        width="100%"
                                        height="100%"
                                        style={{ border: 0 }}
                                        allowFullScreen
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Column - Contact Form (Sticky) */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24 bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-lg border border-slate-100 dark:border-slate-800">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Get in Touch</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                                Interested in this project? Submit your details and we&apos;ll get back to you.
                            </p>
                            <button
                                onClick={() => setShowEnquiryModal(true)}
                                className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-md flex items-center justify-center gap-2"
                            >
                                <Mail className="w-4 h-4" />
                                Send Enquiry
                            </button>
                            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                <a
                                    href={`tel:${COMPANY_PHONE_TEL}`}
                                    className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors shadow-md flex items-center justify-center gap-2"
                                >
                                    <Phone className="w-4 h-4" />
                                    Call Now
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Similar Projects */}
                {similarProjects.length > 0 && (
                    <div className="mt-12">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Similar Projects</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {similarProjects.map((proj) => (
                                <SimilarProjectCard key={proj.id} project={proj} />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Enquiry Modal */}
            {showEnquiryModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800"
                    >
                        {enquirySubmitted ? (
                            <div className="text-center py-8">
                                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Enquiry Submitted!</h3>
                                <p className="text-slate-600 dark:text-slate-400">We&apos;ll get back to you shortly.</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Send Enquiry</h3>
                                    <button
                                        onClick={() => setShowEnquiryModal(false)}
                                        className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                                    </button>
                                </div>
                                <form onSubmit={handleEnquirySubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Name *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            placeholder="Your name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Phone *</label>
                                        <input
                                            type="tel"
                                            required
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            placeholder="Your phone number"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email</label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            placeholder="Your email (optional)"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Message</label>
                                        <textarea
                                            rows={3}
                                            value={formData.message}
                                            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                            className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            placeholder="Any specific requirements?"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                                    >
                                        Submit Enquiry
                                    </button>
                                </form>
                            </>
                        )}
                    </motion.div>
                </div>
            )}
        </div>
    );
}

function SimilarProjectCard({ project }: { project: Project }) {
    const firstImage = getMediaUrl(project.media?.find(m => m.media_type === 'IMAGE')?.media_url);
    const minPrice = project.units?.length > 0 ? Math.min(...project.units.map(u => u.price_min)) : null;
    const priceUnit = project.units[0]?.price_unit || 'Lakh';

    return (
        <Link href={`/projects/${project.id}`}>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-all border border-slate-100 dark:border-slate-800">
                <div className="relative h-48 bg-slate-200 dark:bg-slate-700">
                    {firstImage ? (
                        <img src={firstImage} alt={project.name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-600">
                            <Building2 className="w-12 h-12" />
                        </div>
                    )}
                    {project.rera_number && (
                        <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-semibold">
                            RERA
                        </div>
                    )}
                </div>
                <div className="p-4">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-1 line-clamp-1">{project.name}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 flex items-center">
                        <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                        {project.locality}, {project.city}
                    </p>
                    {minPrice && (
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            ₹{minPrice}+ {priceUnit}
                        </p>
                    )}
                </div>
            </div>
        </Link>
    );
}
