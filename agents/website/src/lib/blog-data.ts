export interface BlogPost {
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    category: 'buying' | 'selling' | 'renting' | 'market-trends' | 'legal' | 'tips';
    author: string;
    authorAvatar: string;
    date: string;
    readTime: string;
    image: string | null;
}

export const blogCategories = [
    { id: 'all', label: 'All' },
    { id: 'buying', label: 'Buying' },
    { id: 'selling', label: 'Selling' },
    { id: 'renting', label: 'Renting' },
    { id: 'market-trends', label: 'Market Trends' },
    { id: 'legal', label: 'Legal' },
    { id: 'tips', label: 'Tips' },
];

export const blogPosts: BlogPost[] = [
    {
        slug: '10-tips-first-time-home-buyers-india',
        title: '10 Tips for First-Time Home Buyers in India',
        excerpt: 'Buying your first home is exciting but overwhelming. Here are essential tips to help you navigate the Indian real estate market with confidence.',
        content: `<p>Buying your first home in India is one of the most significant financial decisions you'll ever make. The Indian real estate market, with its diverse options ranging from affordable housing to luxury apartments, offers something for every buyer. However, navigating this complex landscape requires careful planning and informed decision-making.</p><p>Start by assessing your financial health. Calculate your budget considering not just the property price but also stamp duty (typically 5-7%), registration charges, GST (for under-construction properties), maintenance deposits, and interior costs. A general rule is that your EMI should not exceed 40% of your monthly income.</p><p>Location is paramount. Consider factors like connectivity to your workplace, proximity to schools and hospitals, upcoming infrastructure projects (metro lines, highways), and the neighbourhood's safety record. Areas with upcoming metro connectivity often see 20-30% appreciation within 2-3 years of announcement.</p><p>Always verify the property's RERA registration, check the builder's track record, and insist on seeing all legal documents including the title deed, encumbrance certificate, approved building plan, and completion certificate. Using services like Panditji AI can help streamline your search and verification process.</p>`,
        category: 'buying',
        author: 'Realty Pandit',
        authorAvatar: 'RP',
        date: '2025-01-15',
        readTime: '5 min read',
        image: null,
    },
    {
        slug: 'understanding-rera-complete-guide',
        title: 'Understanding RERA: Your Complete Guide',
        excerpt: 'RERA has transformed Indian real estate. Learn about your rights as a buyer and how RERA protects your investment.',
        content: `<p>The Real Estate (Regulation and Development) Act, 2016, commonly known as RERA, is a landmark legislation that has fundamentally changed the Indian real estate landscape. Enacted to protect home buyers and promote transparency, RERA establishes regulatory authorities in each state to oversee real estate transactions.</p><p>Under RERA, every real estate project with a plot size of over 500 square meters or more than 8 apartments must be registered with the state RERA authority before advertising or selling. Builders must disclose project plans, layout, government approvals, land title status, and completion timelines on the RERA website.</p><p>For buyers, RERA provides several crucial protections: builders cannot demand more than 10% of property cost as advance before sale agreement, projects must be delivered as per the approved plan, buyers are entitled to full refund with interest if possession is delayed, and there's a 5-year structural defect liability period post-possession.</p><p>To verify a property's RERA status, visit your state's RERA website, search by project name or RERA number, and review the compliance status. At Realty Pandit, every listed property is verified for RERA compliance, giving you peace of mind in your property search.</p>`,
        category: 'legal',
        author: 'Realty Pandit',
        authorAvatar: 'RP',
        date: '2025-01-10',
        readTime: '7 min read',
        image: null,
    },
    {
        slug: 'ai-transforming-real-estate-2025',
        title: 'How AI is Transforming Real Estate in 2025',
        excerpt: 'From virtual tours to AI property matching, discover how artificial intelligence is revolutionizing the way we buy and sell properties.',
        content: `<p>Artificial Intelligence is no longer a futuristic concept in real estate — it's here, and it's transforming every aspect of the industry. From property search and valuation to documentation and customer service, AI is making the real estate experience faster, smarter, and more personalized than ever before.</p><p>AI-powered property matching algorithms, like the one powering Panditji at Realty Pandit, can understand natural language queries like "3BHK flat near metro in Noida under 80 lakhs" and instantly match buyers with relevant properties. These systems learn from user preferences and behaviour to provide increasingly accurate recommendations over time.</p><p>Virtual property tours powered by AI and 3D imaging allow buyers to explore properties from anywhere in the world. AI can also generate accurate property valuations by analysing thousands of data points including location, amenities, market trends, and comparable sales, reducing the uncertainty in property pricing.</p><p>On the documentation side, AI is streamlining the traditionally cumbersome paperwork process. From automated document verification to smart contract generation, what used to take weeks can now be accomplished in days. The future of real estate is intelligent, and early adopters stand to gain the most.</p>`,
        category: 'market-trends',
        author: 'Sunny Sharma',
        authorAvatar: 'SS',
        date: '2025-01-08',
        readTime: '6 min read',
        image: null,
    },
    {
        slug: 'noida-vs-gurgaon-investment-2025',
        title: 'Noida vs Gurgaon: Where to Invest in 2025?',
        excerpt: 'A comprehensive comparison of two of NCR\'s hottest real estate markets. Find out which city offers better returns for your investment.',
        content: `<p>The eternal debate in NCR real estate — Noida or Gurgaon? Both cities have evolved dramatically over the past decade, transforming from satellite towns into thriving urban centres with world-class infrastructure. But when it comes to real estate investment in 2025, each offers distinct advantages.</p><p>Gurgaon (now Gurugram) continues to dominate as a corporate hub with over 300 Fortune 500 companies. Property prices in prime sectors (56-65) range from ₹8,000-15,000 per sqft, while New Gurgaon (sectors 76-95) offers more affordable options at ₹5,000-8,000 per sqft. The upcoming DWARKA expressway projects promise significant appreciation.</p><p>Noida, particularly Greater Noida and the Noida Extension (Gaur City belt), offers more affordable entry points at ₹3,500-6,000 per sqft. The Jewar International Airport, expected to be operational by 2025-26, is a game-changer that could drive 30-40% appreciation in surrounding areas. Sector 150 and the Yamuna Expressway corridor are hotspots.</p><p>For end-users with a moderate budget, Noida offers better value with newer developments and modern amenities. For investors seeking established markets with strong rental yields (3-4% annually), Gurgaon's proximity to corporate offices gives it an edge. Consult Panditji for personalised advice based on your investment goals.</p>`,
        category: 'market-trends',
        author: 'Realty Pandit',
        authorAvatar: 'RP',
        date: '2025-01-05',
        readTime: '8 min read',
        image: null,
    },
    {
        slug: 'true-cost-buying-home-india',
        title: 'How to Calculate the True Cost of Buying a Home',
        excerpt: 'The sticker price is just the beginning. Understand all the hidden costs that go into buying a property in India.',
        content: `<p>When you find a property listed at ₹80 lakhs, the actual cost of ownership can easily reach ₹95-100 lakhs. Understanding these additional costs upfront is crucial for financial planning and avoiding unpleasant surprises. Here's a comprehensive breakdown of every cost you need to consider.</p><p>Stamp duty varies by state — it's 5-7% in most states, with some offering concessions for women buyers (1-2% less in states like Delhi and Haryana). Registration charges add another 1% of property value. For under-construction properties, GST at 5% (without ITC) applies on the agreement value minus land component.</p><p>If you're taking a home loan, factor in processing fees (0.5-1% of loan amount), legal verification charges, and insurance premiums. The bank may also require you to maintain a certain relationship value. Don't forget the monthly maintenance charges (₹2-5 per sqft in gated societies), property tax (varies by municipal area), and home insurance.</p><p>Moving-in costs include interior work (₹500-2000 per sqft depending on scope), modular kitchen (₹1.5-5 lakhs), electrical fittings, and furniture. Budget at least 10-15% of the property value for interior setup. Use our EMI calculator tool to plan your finances accurately.</p>`,
        category: 'buying',
        author: 'Realty Pandit',
        authorAvatar: 'RP',
        date: '2024-12-28',
        readTime: '6 min read',
        image: null,
    },
    {
        slug: 'top-5-mistakes-sellers-avoid',
        title: 'Top 5 Mistakes Sellers Make and How to Avoid Them',
        excerpt: 'Selling your property? Avoid these common pitfalls that can cost you lakhs and delay your sale.',
        content: `<p>Selling a property in India involves more than just listing it on a portal and waiting for buyers. Many sellers make costly mistakes that either reduce their sale price or significantly delay the transaction. Here are the top five mistakes and how to avoid them.</p><p>Mistake #1: Overpricing your property. Emotional attachment often leads sellers to price 15-20% above market value. This results in the property sitting unsold for months, eventually requiring price drops that signal desperation. Get a professional valuation or use AI tools to understand the fair market price based on recent comparable sales in your area.</p><p>Mistake #2: Neglecting property presentation. First impressions matter enormously. A fresh coat of paint (₹30,000-50,000 for a 2BHK), professional cleaning, minor repairs, and decluttering can increase your sale price by 5-10%. Good quality photos are essential for online listings.</p><p>Mistake #3: Incomplete documentation. Ensure your title is clear, all property tax is paid, society NOC is obtained, and encumbrance certificate is ready before listing. Missing documents can derail a deal at the last moment and frustrate serious buyers. List your property with Realty Pandit for guided assistance through the entire selling process.</p>`,
        category: 'selling',
        author: 'Sunny Sharma',
        authorAvatar: 'SS',
        date: '2024-12-20',
        readTime: '5 min read',
        image: null,
    },
    {
        slug: 'rental-agreement-essentials-tenants',
        title: 'Rental Agreement Essentials: What Every Tenant Must Know',
        excerpt: 'Before signing that rental agreement, make sure you understand these crucial clauses that protect your rights as a tenant.',
        content: `<p>A rental agreement is more than just a formality — it's a legally binding document that defines the rights and obligations of both landlord and tenant. In India, rental agreements are governed by state-specific Rent Control Acts and the Model Tenancy Act, 2021. Understanding key clauses can save you from disputes and financial loss.</p><p>Essential clauses to verify: rent amount and payment date, security deposit (typically 2-3 months' rent in most cities, up to 10 months in Bangalore), lock-in period (usually 6-12 months), notice period for termination (typically 1-2 months), maintenance charges responsibility, and allowed usage (residential/commercial).</p><p>Always insist on registering the agreement if the lease exceeds 11 months — unregistered agreements are not admissible in court. Ensure the agreement mentions the condition of the property and existing fittings/fixtures. Take dated photographs before moving in as evidence. Clarify who bears costs for repairs — usually, structural repairs are the landlord's responsibility while minor repairs fall on the tenant.</p><p>Red flags to watch for: verbal agreements without documentation, demands for excessive advance rent, reluctance to register the agreement, vague termination clauses, and restrictions not mentioned during property viewing. At Realty Pandit, all rental listings come with standard verified agreements.</p>`,
        category: 'renting',
        author: 'Realty Pandit',
        authorAvatar: 'RP',
        date: '2024-12-15',
        readTime: '6 min read',
        image: null,
    },
    {
        slug: 'commercial-real-estate-investment-guide',
        title: 'Commercial Real Estate Investment Guide for Beginners',
        excerpt: 'Thinking of investing in commercial property? Here\'s everything you need to know about offices, shops, and warehouses.',
        content: `<p>Commercial real estate (CRE) in India has emerged as an attractive investment avenue, offering rental yields of 6-10% compared to 2-3% for residential properties. With the growth of IT/ITeS, e-commerce, and the startup ecosystem, demand for quality commercial spaces continues to rise across major cities.</p><p>Types of commercial investments: Office spaces in IT parks and business centres offer the most stable returns with long-term leases (5-9 years). Retail shops in high-street locations or malls can yield higher returns but carry more risk. Warehouses and logistics parks, driven by e-commerce growth, are the newest asset class with yields of 8-10%.</p><p>Key factors to evaluate: location and connectivity (metro access is a premium), tenant quality (MNCs and listed companies preferred), lease terms (escalation clauses of 5% annually or 15% every 3 years are standard), building grade (Grade A buildings command premium rents), and REIT eligibility (well-managed commercial assets may be acquired by REITs at premium valuations).</p><p>Entry barriers are higher — commercial properties typically start at ₹50 lakhs for small offices and can go into crores for prime locations. If direct investment is beyond your budget, consider Real Estate Investment Trusts (REITs) which allow you to invest in commercial real estate with as little as ₹10,000-15,000.</p>`,
        category: 'tips',
        author: 'Sunny Sharma',
        authorAvatar: 'SS',
        date: '2024-12-10',
        readTime: '7 min read',
        image: null,
    },
    {
        slug: 'gst-real-estate-guide',
        title: 'GST on Real Estate: Everything You Need to Know',
        excerpt: 'Confused about GST on property purchases? This comprehensive guide breaks down GST rates, exemptions, and how it affects your property transaction.',
        content: `<p>The Goods and Services Tax (GST) on real estate is one of the most confusing aspects of property buying in India. Since its introduction, the rates and rules have been revised multiple times. Here's the current position that every buyer and seller should understand.</p><p>For under-construction properties: Affordable housing (up to ₹45 lakhs, carpet area up to 60 sqm in metros / 90 sqm in non-metros) attracts 1% GST without Input Tax Credit (ITC). Other under-construction properties attract 5% GST without ITC. These rates apply on the total agreement value minus one-third (considered as land component).</p><p>Ready-to-move-in properties with Completion Certificate (CC) or Occupation Certificate (OC) are exempt from GST. This is a significant advantage for buyers looking at completed projects. However, the property's price may already factor in the builder's tax costs.</p><p>For sellers of residential properties, GST does not apply on resale transactions between individuals. Commercial property rentals above ₹20 lakhs annually attract 18% GST. Joint development agreements have specific provisions where the builder pays GST on the portion retained. Always consult a tax professional for your specific situation, and use Realty Pandit's resources for up-to-date information.</p>`,
        category: 'legal',
        author: 'Realty Pandit',
        authorAvatar: 'RP',
        date: '2024-12-05',
        readTime: '6 min read',
        image: null,
    },
    {
        slug: 'smart-home-features-increase-property-value',
        title: 'Smart Home Features That Increase Property Value',
        excerpt: 'Smart home technology isn\'t just convenient — it can significantly boost your property\'s resale value. Here are the upgrades worth investing in.',
        content: `<p>The Indian smart home market is projected to reach $13 billion by 2025, and savvy homeowners are leveraging this trend to increase their property values. Smart home features can add 5-8% to your property's resale value while also reducing utility costs and enhancing security.</p><p>Top value-adding smart features: Smart locks and video doorbells (₹5,000-25,000) provide security and convenience, appealing strongly to young buyers. Smart lighting systems (₹15,000-50,000 for a 3BHK) with app control and scheduling can reduce electricity bills by 20-30%. Smart ACs and thermostats (₹10,000-30,000) offer energy efficiency that buyers increasingly prioritise.</p><p>Home automation hubs like Google Home or Alexa-integrated systems (₹5,000-15,000) serve as the backbone of a smart home, controlling everything from lights to curtains. CCTV systems with cloud storage (₹20,000-50,000) have become almost essential in gated communities. Smart water purifiers and automated kitchen chimneys are emerging as expected features in premium homes.</p><p>The key is to invest in features that are visible during property viewings and easy to demonstrate. A home that responds to voice commands and showcases modern technology creates a lasting impression on potential buyers. Energy efficiency certifications and green building features are also increasingly valued in the Indian market.</p>`,
        category: 'tips',
        author: 'Realty Pandit',
        authorAvatar: 'RP',
        date: '2024-12-01',
        readTime: '5 min read',
        image: null,
    },
];

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
    return blogPosts.find(post => post.slug === slug);
}

export function getBlogPostsByCategory(category: string): BlogPost[] {
    if (category === 'all') return blogPosts;
    return blogPosts.filter(post => post.category === category);
}

export function getRelatedPosts(currentSlug: string, category: string, limit = 3): BlogPost[] {
    return blogPosts.filter(post => post.slug !== currentSlug && post.category === category).slice(0, limit);
}
