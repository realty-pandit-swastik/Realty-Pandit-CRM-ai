export default function Loading() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20 flex flex-col items-center justify-center px-4">
            {/* Spinner with branding */}
            <div className="relative mb-8">
                <div className="w-16 h-16 border-4 border-slate-200 dark:border-slate-700 rounded-full" />
                <div className="absolute inset-0 w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-blue-600 dark:text-blue-400 font-bold text-xs">RP</span>
                </div>
            </div>

            <p className="text-slate-600 dark:text-slate-300 font-medium text-sm mb-8">Loading Realty Pandit...</p>

            {/* Skeleton pulse content */}
            <div className="w-full max-w-4xl space-y-6">
                {/* Hero skeleton */}
                <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl animate-pulse" />

                {/* Cards skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="space-y-3">
                            <div className="h-44 bg-slate-200 dark:bg-slate-800 rounded-2xl animate-pulse" />
                            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse w-3/4" />
                            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse w-1/2" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
