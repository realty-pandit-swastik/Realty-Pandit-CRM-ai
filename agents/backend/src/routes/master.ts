
import { Router } from 'express';
import prisma from '../db';

const router = Router();

// GET /master/categories - All active categories with property counts
router.get('/categories', async (_req, res) => {
    try {
        const categories = await prisma.propertyCategory.findMany({
            where: { is_active: true },
            include: {
                sub_categories: {
                    where: { is_active: true },
                    include: {
                        property_types: {
                            where: { is_active: true },
                            orderBy: { display_order: 'asc' }
                        },
                        _count: { select: { inventory: true } }
                    },
                    orderBy: { display_order: 'asc' }
                },
                _count: { select: { inventory: true } }
            },
            orderBy: { display_order: 'asc' }
        });
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /master/categories/:id/subcategories - Cascading subcategories for a category
router.get('/categories/:id/subcategories', async (req, res) => {
    try {
        const subcategories = await prisma.propertySubCategory.findMany({
            where: { category_id: req.params.id, is_active: true },
            include: {
                property_types: {
                    where: { is_active: true },
                    orderBy: { display_order: 'asc' }
                },
                _count: { select: { inventory: true } }
            },
            orderBy: { display_order: 'asc' }
        });
        res.json(subcategories);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /master/subcategories/:id/types - Cascading property types for a subcategory
router.get('/subcategories/:id/types', async (req, res) => {
    try {
        const types = await prisma.propertyType.findMany({
            where: { sub_category_id: req.params.id, is_active: true },
            orderBy: { display_order: 'asc' }
        });
        res.json(types);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /master/subcategories/:id - Single subcategory with validation rules
router.get('/subcategories/:id', async (req, res) => {
    try {
        const subcategory = await prisma.propertySubCategory.findUnique({
            where: { id: req.params.id },
            include: {
                property_types: {
                    where: { is_active: true },
                    orderBy: { display_order: 'asc' }
                }
            }
        });
        if (!subcategory) return res.status(404).json({ error: 'Subcategory not found' });
        res.json(subcategory);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /master/configurations - All active configurations
router.get('/configurations', async (_req, res) => {
    try {
        const configs = await prisma.propertyConfiguration.findMany({
            where: { is_active: true },
            orderBy: { display_order: 'asc' }
        });
        res.json(configs);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /master/usage-types - All usage types
router.get('/usage-types', async (_req, res) => {
    try {
        const types = await prisma.usageType.findMany({
            where: { is_active: true },
            orderBy: { display_order: 'asc' }
        });
        res.json(types);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /master/investment-types - All investment types
router.get('/investment-types', async (_req, res) => {
    try {
        const types = await prisma.investmentType.findMany({
            where: { is_active: true },
            orderBy: { display_order: 'asc' }
        });
        res.json(types);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /master/tree - Complete classification tree in one call (for filters/dropdowns)
router.get('/tree', async (_req, res) => {
    try {
        const [categories, configurations, usageTypes, investmentTypes] = await Promise.all([
            prisma.propertyCategory.findMany({
                where: { is_active: true },
                include: {
                    sub_categories: {
                        where: { is_active: true },
                        include: {
                            property_types: {
                                where: { is_active: true },
                                orderBy: { display_order: 'asc' }
                            }
                        },
                        orderBy: { display_order: 'asc' }
                    }
                },
                orderBy: { display_order: 'asc' }
            }),
            prisma.propertyConfiguration.findMany({
                where: { is_active: true },
                orderBy: { display_order: 'asc' }
            }),
            prisma.usageType.findMany({
                where: { is_active: true },
                orderBy: { display_order: 'asc' }
            }),
            prisma.investmentType.findMany({
                where: { is_active: true },
                orderBy: { display_order: 'asc' }
            })
        ]);

        res.json({
            categories,
            configurations,
            usage_types: usageTypes,
            investment_types: investmentTypes
        });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
