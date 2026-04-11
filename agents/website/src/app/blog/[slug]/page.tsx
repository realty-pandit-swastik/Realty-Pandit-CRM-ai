import { notFound } from 'next/navigation';
import { ChevronRight, Clock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getBlogPostBySlug, getRelatedPosts } from '@/lib/blog-data';
import BlogShareButtons from './BlogShareButtons';

export default async function BlogDetailPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const post = getBlogPostBySlug(slug);

    if (!post) notFound();

    const relatedPosts = getRelatedPosts(slug, post.category, 3);

    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 pt-32 pb-20">
                <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div>
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
                            <Link href="/" className="hover:text-white transition-colors">Home</Link>
                            <ChevronRight className="w-4 h-4" />
                            <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
                            <ChevronRight className="w-4 h-4" />
                            <span className="text-white truncate max-w-[200px]">{post.title}</span>
                        </div>

                        {/* Category */}
                        <span className="inline-block px-3 py-1 bg-blue-500/20 text-blue-300 text-xs font-semibold rounded-full mb-4 capitalize">
                            {post.category.replace('-', ' ')}
                        </span>

                        {/* Title */}
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
                            {post.title}
                        </h1>

                        {/* Meta */}
                        <div className="flex flex-wrap items-center gap-4 text-slate-400">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                                    <span className="text-white text-xs font-bold">{post.authorAvatar}</span>
                                </div>
                                <span>{post.author}</span>
                            </div>
                            <span>{new Date(post.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                            <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {post.readTime}
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Gradient Image Placeholder */}
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
                <div className="aspect-[2/1] rounded-2xl bg-slate-200 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-lg">
                    <span className="text-slate-400 dark:text-slate-500">Featured Image</span>
                </div>
            </div>

            {/* Article Content */}
            <section className="py-16 bg-white dark:bg-slate-900">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <article
                        className="prose prose-slate dark:prose-invert max-w-none [&_p]:text-slate-600 dark:[&_p]:text-slate-300 [&_p]:mb-4 [&_p]:leading-relaxed [&_p]:text-lg"
                        // SAFETY: content is hardcoded in blog-data.ts. If sourced from CMS/API, sanitize with DOMPurify first.
                        dangerouslySetInnerHTML={{ __html: post.content }}
                    />

                    <BlogShareButtons title={post.title} />
                </div>
            </section>

            {/* Related Posts */}
            {relatedPosts.length > 0 && (
                <section className="py-16 bg-slate-50 dark:bg-slate-800/50">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="mb-8">
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Related Articles</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {relatedPosts.map((related) => (
                                <div key={related.slug}>
                                    <Link
                                        href={`/blog/${related.slug}`}
                                        className="group block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                                    >
                                        <div className="aspect-[16/10] bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                                            <span className="text-slate-400 dark:text-slate-500 text-sm">Blog Image</span>
                                        </div>
                                        <div className="p-5">
                                            <span className="inline-block px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold rounded-full mb-2 capitalize">
                                                {related.category.replace('-', ' ')}
                                            </span>
                                            <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                                                {related.title}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-3 text-slate-400 dark:text-slate-500 text-xs">
                                                <span>{new Date(related.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {related.readTime}
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}
