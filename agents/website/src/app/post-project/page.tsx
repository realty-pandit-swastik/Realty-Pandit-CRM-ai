'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, CheckCircle2, Building2, Home, Upload, FileText, MapPin, X, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const STEPS = [
    { id: 1, name: 'Basic Info', icon: Building2 },
    { id: 2, name: 'Unit Details', icon: Home },
    { id: 3, name: 'Media Upload', icon: Upload },
    { id: 4, name: 'Additional Details', icon: FileText },
    { id: 5, name: 'Preview & Submit', icon: CheckCircle2 }
];

const PROJECT_TYPES = ['RESIDENTIAL', 'COMMERCIAL', 'MIXED_USE', 'PLOTTED_DEVELOPMENT'];
const PROJECT_STATUS = ['PRE_LAUNCH', 'UNDER_CONSTRUCTION', 'READY_TO_MOVE', 'COMPLETED'];
const CONFIGURATIONS = ['1BHK', '2BHK', '3BHK', '4BHK', '5BHK+', 'STUDIO', 'PENTHOUSE', 'VILLA', 'PLOT'];

interface Unit {
    configuration: string;
    areaMin: number;
    areaMax: number;
    areaUnit: string;
    priceMin: number;
    priceMax: number;
    priceUnit: string;
    totalUnits: number;
    availableUnits: number;
}

export default function PostProjectPage() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // Form data
    const [formData, setFormData] = useState({
        // Step 1: Basic Info
        name: '',
        projectType: 'RESIDENTIAL',
        city: '',
        locality: '',
        reraNumber: '',

        // Step 2: Units
        units: [] as Unit[],

        // Step 3: Media
        images: [] as File[],
        floorPlans: [] as File[],
        brochure: null as File | null,

        // Step 4: Additional Details
        shortDescription: '',
        longDescription: '',
        possessionDate: '',
        projectStatus: 'UNDER_CONSTRUCTION',
        googleMapLink: '',
        amenities: [] as string[],

        // Builder Contact
        builderName: '',
        builderEmail: '',
        builderPhone: ''
    });

    // Load draft from localStorage
    useEffect(() => {
        const draft = localStorage.getItem('post-project-draft');
        if (draft) {
            try {
                const parsed = JSON.parse(draft);
                setFormData({ ...formData, ...parsed });
            } catch (e) {
                console.error('Failed to load draft:', e);
            }
        }
    }, []);

    // Save draft to localStorage
    useEffect(() => {
        const saveDraft = () => {
            const draftData = {
                ...formData,
                images: [], // Don't save files in localStorage
                floorPlans: [],
                brochure: null
            };
            localStorage.setItem('post-project-draft', JSON.stringify(draftData));
        };

        const debounce = setTimeout(saveDraft, 1000);
        return () => clearTimeout(debounce);
    }, [formData]);

    const nextStep = () => {
        if (currentStep < STEPS.length) {
            setCurrentStep(currentStep + 1);
        }
    };

    const prevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleAddUnit = () => {
        setFormData({
            ...formData,
            units: [
                ...formData.units,
                {
                    configuration: '2BHK',
                    areaMin: 0,
                    areaMax: 0,
                    areaUnit: 'sq.ft',
                    priceMin: 0,
                    priceMax: 0,
                    priceUnit: 'Lakh',
                    totalUnits: 0,
                    availableUnits: 0
                }
            ]
        });
    };

    const handleRemoveUnit = (index: number) => {
        setFormData({
            ...formData,
            units: formData.units.filter((_, i) => i !== index)
        });
    };

    const handleUnitChange = (index: number, field: keyof Unit, value: any) => {
        const newUnits = [...formData.units];
        newUnits[index] = { ...newUnits[index], [field]: value };
        setFormData({ ...formData, units: newUnits });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'images' | 'floorPlans' | 'brochure') => {
        const files = e.target.files;
        if (!files) return;

        if (type === 'brochure') {
            setFormData({ ...formData, brochure: files[0] });
        } else {
            setFormData({ ...formData, [type]: Array.from(files) });
        }
    };

    const handleSubmit = async () => {
        setSubmitting(true);

        // In a real implementation, this would:
        // 1. Validate all fields
        // 2. Upload media files
        // 3. Submit project data to backend
        // 4. Clear draft from localStorage

        setTimeout(() => {
            setSubmitting(false);
            setSubmitted(true);
            localStorage.removeItem('post-project-draft');

            setTimeout(() => {
                router.push('/properties?tab=projects');
            }, 3000);
        }, 2000);
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case 1:
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Basic Project Information</h2>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Project Name *</label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                placeholder="e.g., Green Valley Apartments"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Project Type *</label>
                                <select
                                    value={formData.projectType}
                                    onChange={(e) => setFormData({ ...formData, projectType: e.target.value })}
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                >
                                    {PROJECT_TYPES.map(type => (
                                        <option key={type} value={type}>{type.replace('_', ' ')}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Project Status *</label>
                                <select
                                    value={formData.projectStatus}
                                    onChange={(e) => setFormData({ ...formData, projectStatus: e.target.value })}
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                >
                                    {PROJECT_STATUS.map(status => (
                                        <option key={status} value={status}>{status.replace('_', ' ')}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">City *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.city}
                                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                    placeholder="e.g., Noida"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Locality *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.locality}
                                    onChange={(e) => setFormData({ ...formData, locality: e.target.value })}
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                    placeholder="e.g., Sector 62"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">RERA Number</label>
                            <input
                                type="text"
                                value={formData.reraNumber}
                                onChange={(e) => setFormData({ ...formData, reraNumber: e.target.value })}
                                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                placeholder="e.g., UPRERAPRJ12345"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Expected Possession Date</label>
                            <input
                                type="date"
                                value={formData.possessionDate}
                                onChange={(e) => setFormData({ ...formData, possessionDate: e.target.value })}
                                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                );

            case 2:
                return (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Unit Configurations</h2>
                            <button
                                onClick={handleAddUnit}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Add Unit
                            </button>
                        </div>

                        {formData.units.length === 0 ? (
                            <div className="text-center py-12 bg-slate-50 dark:bg-slate-800 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600">
                                <Home className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                                <p className="text-slate-600 dark:text-slate-400 mb-4">No units added yet</p>
                                <button
                                    onClick={handleAddUnit}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                                >
                                    Add Your First Unit
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {formData.units.map((unit, index) => (
                                    <div key={index} className="p-6 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold text-slate-900 dark:text-white">Unit #{index + 1}</h3>
                                            <button
                                                onClick={() => handleRemoveUnit(index)}
                                                className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Configuration *</label>
                                                <select
                                                    value={unit.configuration}
                                                    onChange={(e) => handleUnitChange(index, 'configuration', e.target.value)}
                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                                                >
                                                    {CONFIGURATIONS.map(config => (
                                                        <option key={config} value={config}>{config}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Min Area (sq.ft) *</label>
                                                <input
                                                    type="number"
                                                    value={unit.areaMin || ''}
                                                    onChange={(e) => handleUnitChange(index, 'areaMin', Number(e.target.value))}
                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Max Area (sq.ft)</label>
                                                <input
                                                    type="number"
                                                    value={unit.areaMax || ''}
                                                    onChange={(e) => handleUnitChange(index, 'areaMax', Number(e.target.value))}
                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Min Price *</label>
                                                <input
                                                    type="number"
                                                    value={unit.priceMin || ''}
                                                    onChange={(e) => handleUnitChange(index, 'priceMin', Number(e.target.value))}
                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Max Price</label>
                                                <input
                                                    type="number"
                                                    value={unit.priceMax || ''}
                                                    onChange={(e) => handleUnitChange(index, 'priceMax', Number(e.target.value))}
                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Price Unit *</label>
                                                <select
                                                    value={unit.priceUnit}
                                                    onChange={(e) => handleUnitChange(index, 'priceUnit', e.target.value)}
                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                                                >
                                                    <option value="Lakh">Lakh</option>
                                                    <option value="Crore">Crore</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Total Units</label>
                                                <input
                                                    type="number"
                                                    value={unit.totalUnits || ''}
                                                    onChange={(e) => handleUnitChange(index, 'totalUnits', Number(e.target.value))}
                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Available Units</label>
                                                <input
                                                    type="number"
                                                    value={unit.availableUnits || ''}
                                                    onChange={(e) => handleUnitChange(index, 'availableUnits', Number(e.target.value))}
                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );

            case 3:
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Upload Media</h2>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Project Images *</label>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Upload up to 20 images (JPG, PNG)</p>
                            <input
                                type="file"
                                multiple
                                accept="image/*"
                                onChange={(e) => handleFileChange(e, 'images')}
                                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                            />
                            {formData.images.length > 0 && (
                                <p className="text-sm text-green-600 dark:text-green-400 mt-2">{formData.images.length} file(s) selected</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Floor Plans *</label>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Upload floor plan images</p>
                            <input
                                type="file"
                                multiple
                                accept="image/*"
                                onChange={(e) => handleFileChange(e, 'floorPlans')}
                                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                            />
                            {formData.floorPlans.length > 0 && (
                                <p className="text-sm text-green-600 dark:text-green-400 mt-2">{formData.floorPlans.length} floor plan(s) selected</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Brochure (PDF)</label>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Upload project brochure (optional)</p>
                            <input
                                type="file"
                                accept="application/pdf"
                                onChange={(e) => handleFileChange(e, 'brochure')}
                                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                            />
                            {formData.brochure && (
                                <p className="text-sm text-green-600 dark:text-green-400 mt-2">{formData.brochure.name} selected</p>
                            )}
                        </div>

                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                                <strong>Note:</strong> Media files are temporarily stored. They will be uploaded when you submit the form.
                            </p>
                        </div>
                    </div>
                );

            case 4:
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Additional Details</h2>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Short Description *</label>
                            <textarea
                                rows={3}
                                required
                                value={formData.shortDescription}
                                onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
                                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                placeholder="Brief description for listings (100-200 characters)"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Long Description</label>
                            <textarea
                                rows={6}
                                value={formData.longDescription}
                                onChange={(e) => setFormData({ ...formData, longDescription: e.target.value })}
                                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                placeholder="Detailed description of the project, amenities, highlights, etc."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Google Maps Link</label>
                            <input
                                type="url"
                                value={formData.googleMapLink}
                                onChange={(e) => setFormData({ ...formData, googleMapLink: e.target.value })}
                                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                placeholder="https://maps.google.com/..."
                            />
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Builder Contact Information</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Builder Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.builderName}
                                        onChange={(e) => setFormData({ ...formData, builderName: e.target.value })}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                        placeholder="Your company name"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email *</label>
                                    <input
                                        type="email"
                                        required
                                        value={formData.builderEmail}
                                        onChange={(e) => setFormData({ ...formData, builderEmail: e.target.value })}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                        placeholder="your@email.com"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Phone *</label>
                                    <input
                                        type="tel"
                                        required
                                        value={formData.builderPhone}
                                        onChange={(e) => setFormData({ ...formData, builderPhone: e.target.value })}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                        placeholder="Your phone number"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 5:
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Preview & Submit</h2>

                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Project Summary</h3>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-slate-500 dark:text-slate-400">Project Name</p>
                                    <p className="font-medium text-slate-900 dark:text-white">{formData.name || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 dark:text-slate-400">Type</p>
                                    <p className="font-medium text-slate-900 dark:text-white">{formData.projectType.replace('_', ' ')}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 dark:text-slate-400">Location</p>
                                    <p className="font-medium text-slate-900 dark:text-white">{formData.locality}, {formData.city}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 dark:text-slate-400">Status</p>
                                    <p className="font-medium text-slate-900 dark:text-white">{formData.projectStatus.replace('_', ' ')}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 dark:text-slate-400">Units</p>
                                    <p className="font-medium text-slate-900 dark:text-white">{formData.units.length} configuration(s)</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 dark:text-slate-400">Media</p>
                                    <p className="font-medium text-slate-900 dark:text-white">
                                        {formData.images.length} images, {formData.floorPlans.length} floor plans
                                    </p>
                                </div>
                            </div>

                            {formData.units.length > 0 && (
                                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                                    <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Unit Configurations</h4>
                                    <div className="space-y-2 text-sm">
                                        {formData.units.map((unit, idx) => (
                                            <div key={idx} className="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-800 rounded">
                                                <span className="text-slate-700 dark:text-slate-300">{unit.configuration}</span>
                                                <span className="text-slate-600 dark:text-slate-400">
                                                    {unit.areaMin} sq.ft • ₹{unit.priceMin} {unit.priceUnit}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                            <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                <strong>Note:</strong> By submitting, you confirm that all information is accurate and you have the right to list this project. Your project will be reviewed before going live.
                            </p>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center bg-white dark:bg-slate-900 rounded-2xl p-12 shadow-xl border border-slate-200 dark:border-slate-800 max-w-md"
                >
                    <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-6" />
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">Success!</h2>
                    <p className="text-slate-600 dark:text-slate-400 mb-6">
                        Your project has been submitted successfully. We'll review it and get back to you shortly.
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Redirecting to projects...</p>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-8">
                <div className="max-w-4xl mx-auto px-4">
                    <Link href="/" className="text-sm text-blue-100 hover:text-white mb-2 inline-block">&larr; Back to Home</Link>
                    <h1 className="text-3xl md:text-4xl font-bold">List Your Project</h1>
                    <p className="text-blue-100 mt-2">Reach thousands of potential buyers</p>
                </div>
            </div>

            {/* Progress Steps */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-4xl mx-auto px-4 py-6">
                    <div className="flex items-center justify-between">
                        {STEPS.map((step, index) => {
                            const Icon = step.icon;
                            const isActive = currentStep === step.id;
                            const isCompleted = currentStep > step.id;

                            return (
                                <div key={step.id} className="flex items-center flex-1">
                                    <div className="flex flex-col items-center">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                                            isCompleted ? 'bg-green-500 text-white' :
                                            isActive ? 'bg-blue-600 text-white' :
                                            'bg-slate-200 dark:bg-slate-700 text-slate-400'
                                        }`}>
                                            {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                                        </div>
                                        <p className={`text-xs mt-2 font-medium hidden md:block ${
                                            isActive ? 'text-blue-600 dark:text-blue-400' :
                                            isCompleted ? 'text-green-600 dark:text-green-400' :
                                            'text-slate-500 dark:text-slate-400'
                                        }`}>
                                            {step.name}
                                        </p>
                                    </div>
                                    {index < STEPS.length - 1 && (
                                        <div className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-green-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Form Content */}
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-8">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                        >
                            {renderStepContent()}
                        </motion.div>
                    </AnimatePresence>

                    {/* Navigation Buttons */}
                    <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                        <button
                            onClick={prevStep}
                            disabled={currentStep === 1}
                            className={`px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                                currentStep === 1
                                    ? 'text-slate-400 cursor-not-allowed'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                        >
                            <ChevronLeft className="w-5 h-5" />
                            Previous
                        </button>

                        {currentStep === STEPS.length ? (
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="px-8 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {submitting ? 'Submitting...' : 'Submit Project'}
                                <CheckCircle2 className="w-5 h-5" />
                            </button>
                        ) : (
                            <button
                                onClick={nextStep}
                                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
                            >
                                Next
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
