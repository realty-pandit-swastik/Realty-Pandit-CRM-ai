'use client';

interface VirtualTourBadgeProps {
    hasVideos: boolean;
}

export default function VirtualTourBadge({ hasVideos }: VirtualTourBadgeProps) {
    if (!hasVideos) return null;

    const scrollToVideos = () => {
        document.getElementById('property-videos')?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <button
            onClick={scrollToVideos}
            className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 bg-black/70 backdrop-blur-sm rounded-full text-white text-xs font-semibold hover:bg-black/80 transition-colors"
        >
            <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            Virtual Tour
        </button>
    );
}
