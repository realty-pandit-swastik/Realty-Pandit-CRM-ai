'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Clock, User } from 'lucide-react';
import Link from 'next/link';
import { blogPosts, blogCategories } from '@/lib/blog-data';

export default function BlogPage() {
    const [activeCategory, setActiveCategory] = useState('all');

    const filteredPosts = activeCategory === 'all'
        ? blogPosts
        : blogPosts.filter(post => post.category === activeCategory);

    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 pt-32 pb-20">
                <div className="absolute inset-0 bg-[url(/grid.svg)] opacity-10" />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
                            <Link href="/" className="hover:text-white transition-colors">Home</Link>
                            <ChevronRight className="w-4 h-4" />
                            <span className="text-white">Blog</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
                            Real Estate Insights<br />
                            <span className="text-blue-400">& Tips</span>
                        </h1>
                        <p className="text-lg text-slate-300 max-w-2xl">
                            Stay informed with the latest real estate trends, buying guides, legal updates, and expert tips from the Realty Pandit team.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Category Filter & Blog Grid */}
            <section className="py-20 bg-white dark:bg-slate-900">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Category Tabs */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="flex flex-wrap gap-3 mb-12"
                    >
                        {blogCategories.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={`px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${
                                    activeCategory === cat.id
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </motion.div>

                    {/* Blog Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {filteredPosts.map((post, index) => (
                            <motion.div
                                key={post.slug}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.05 }}
                            >
                                <Link
                                    href={`/blog/${post.slug}`}
                                    className="group block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                                >
                                    {/* Placeholder Image */}
                                    <div className="aspect-[16/10] bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                                        <span className="text-slate-400 dark:text-slate-500 text-sm">Blog Image</span>
                                    </div>

                                    <div className="p-6">
                                        {/* Category Badge */}
                                        <span className="inline-block px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold rounded-full mb-3 capitalize">
                                            {post.category.replace('-', ' ')}
                                        </span>

                                        {/* Title */}
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                                            {post.title}
                                        </h3>

                                        {/* Excerpt */}
                                        <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-4 line-clamp-3">
                                            {post.excerpt}
                                        </p>

                                        {/* Author & Meta */}
                                        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center">
                                                    <span className="text-white text-xs font-bold">{post.authorAvatar}</span>
                                                </div>
                                                <span className="text-slate-500 dark:text-slate-400 text-xs">{post.author}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-xs">
                                                <span>{new Date(post.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {post.readTime}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            </motion.div>
                        ))}
                    </div>

                    {filteredPosts.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center py-16"
                        >
                            <p className="text-slate-500 dark:text-slate-400 text-lg">No posts found in this category.</p>
                        </motion.div>
                    )}
                </div>
            </section>
        </div>
    );
}
