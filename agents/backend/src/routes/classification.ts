import { Router, Request, Response } from 'express';
import prisma from '../db';
import logger from '../utils/logger';
import { cache } from '../middleware/cache';
import { captureRouteError } from '../utils/capture';

const router = Router();

/**
 * GET /public/categories
 * Get all active property categories with property counts
 */
router.get(
    '/categories',
    cache(1800), // 30 min cache
    async (req: Request, res: Response) => {
        try {
            const categories = await prisma.propertyCategory.findMany({
                where: { is_active: true },
                orderBy: { display_order: 'asc' },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    icon: true,
                    description: true,
                    display_order: true,
                    labels_json: true,
                    _count: {
                        select: {
                            sub_categories: true,
                            inventory: true
                        }
                    }
                }
            });

            res.json({
                categories: categories.map(cat => ({
                    id: cat.id,
                    name: cat.name,
                    slug: cat.slug,
                    icon: cat.icon,
                    description: cat.description,
                    display_order: cat.display_order,
                    labels: cat.labels_json,
                    subcategory_count: cat._count.sub_categories,
                    property_count: cat._count.inventory
                }))
            });
        } catch (error) {
        captureRouteError(error, req, { route: 'classification#1' });
            logger.error('Error fetching categories', { error });
            res.status(500).json({ error: 'Failed to fetch categories' });
        }
    }
);

/**
 * GET /public/categories/:id/subcategories
 * Get subcategories for a specific category
 */
router.get(
    '/categories/:id/subcategories',
    cache(1800), // 30 min cache
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            const subcategories = await prisma.propertySubCategory.findMany({
                where: {
                    category_id: id,
                    is_active: true
                },
                orderBy: { display_order: 'asc' },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    icon: true,
                    display_order: true,
                    labels_json: true,
                    validation_rules: true,
                    _count: {
                        select: {
                            property_types: true,
                            inventory: true
                        }
                    }
                }
            });

            res.json({
                subcategories: subcategories.map(sub => ({
                    id: sub.id,
                    name: sub.name,
                    slug: sub.slug,
                    icon: sub.icon,
                    display_order: sub.display_order,
                    labels: sub.labels_json,
                    validation_rules: sub.validation_rules,
                    type_count: sub._count.property_types,
                    property_count: sub._count.inventory
                }))
            });
        } catch (error) {
        captureRouteError(error, req, { route: 'classification#2' });
            logger.error('Error fetching subcategories', { error, categoryId: req.params.id });
            res.status(500).json({ error: 'Failed to fetch subcategories' });
        }
    }
);

/**
 * GET /public/subcategories/:id/types
 * Get property types for a specific subcategory
 */
router.get(
    '/subcategories/:id/types',
    cache(1800), // 30 min cache
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            const types = await prisma.propertyType.findMany({
                where: {
                    sub_category_id: id,
                    is_active: true
                },
                orderBy: { display_order: 'asc' },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    icon: true,
                    display_order: true,
                    labels_json: true,
                    _count: {
                        select: {
                            inventory: true
                        }
                    }
                }
            });

            res.json({
                types: types.map(type => ({
                    id: type.id,
                    name: type.name,
                    slug: type.slug,
                    icon: type.icon,
                    display_order: type.display_order,
                    labels: type.labels_json,
                    property_count: type._count.inventory
                }))
            });
        } catch (error) {
        captureRouteError(error, req, { route: 'classification#3' });
            logger.error('Error fetching property types', { error, subcategoryId: req.params.id });
            res.status(500).json({ error: 'Failed to fetch property types' });
        }
    }
);

/**
 * GET /public/configurations
 * Get all active property configurations (BHK, Office types, etc.)
 */
router.get(
    '/configurations',
    cache(3600), // 1 hour cache
    async (req: Request, res: Response) => {
        try {
            const configurations = await prisma.propertyConfiguration.findMany({
                where: { is_active: true },
                orderBy: { display_order: 'asc' },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    icon: true,
                    display_order: true,
                    labels_json: true,
                    _count: {
                        select: {
                            inventory: true
                        }
                    }
                }
            });

            res.json({
                configurations: configurations.map(config => ({
                    id: config.id,
                    name: config.name,
                    slug: config.slug,
                    icon: config.icon,
                    display_order: config.display_order,
                    labels: config.labels_json,
                    property_count: config._count.inventory
                }))
            });
        } catch (error) {
        captureRouteError(error, req, { route: 'classification#4' });
            logger.error('Error fetching configurations', { error });
            res.status(500).json({ error: 'Failed to fetch configurations' });
        }
    }
);

/**
 * GET /public/usage-types
 * Get all usage types (Self-use, Investment, Rental Income)
 */
router.get(
    '/usage-types',
    cache(3600), // 1 hour cache
    async (req: Request, res: Response) => {
        try {
            const usageTypes = await prisma.usageType.findMany({
                where: { is_active: true },
                orderBy: { display_order: 'asc' },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    icon: true,
                    display_order: true,
                    labels_json: true
                }
            });

            res.json({
                usage_types: usageTypes.map(usage => ({
                    id: usage.id,
                    name: usage.name,
                    slug: usage.slug,
                    icon: usage.icon,
                    display_order: usage.display_order,
                    labels: usage.labels_json
                }))
            });
        } catch (error) {
        captureRouteError(error, req, { route: 'classification#5' });
            logger.error('Error fetching usage types', { error });
            res.status(500).json({ error: 'Failed to fetch usage types' });
        }
    }
);

/**
 * GET /public/investment-types
 * Get all investment types (Pre-launch, Under Construction, Ready to Move)
 */
router.get(
    '/investment-types',
    cache(3600), // 1 hour cache
    async (req: Request, res: Response) => {
        try {
            const investmentTypes = await prisma.investmentType.findMany({
                where: { is_active: true },
                orderBy: { display_order: 'asc' },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    icon: true,
                    display_order: true,
                    labels_json: true
                }
            });

            res.json({
                investment_types: investmentTypes.map(investment => ({
                    id: investment.id,
                    name: investment.name,
                    slug: investment.slug,
                    icon: investment.icon,
                    display_order: investment.display_order,
                    labels: investment.labels_json
                }))
            });
        } catch (error) {
        captureRouteError(error, req, { route: 'classification#6' });
            logger.error('Error fetching investment types', { error });
            res.status(500).json({ error: 'Failed to fetch investment types' });
        }
    }
);

/**
 * GET /public/classification-tree
 * Get complete classification tree in one call (optimized for filters)
 */
router.get(
    '/classification-tree',
    cache(3600), // 1 hour cache
    async (req: Request, res: Response) => {
        try {
            const categories = await prisma.propertyCategory.findMany({
                where: { is_active: true },
                orderBy: { display_order: 'asc' },
                include: {
                    sub_categories: {
                        where: { is_active: true },
                        orderBy: { display_order: 'asc' },
                        include: {
                            property_types: {
                                where: { is_active: true },
                                orderBy: { display_order: 'asc' },
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                    icon: true,
                                    display_order: true,
                                    labels_json: true
                                }
                            }
                        }
                    }
                }
            });

            const [configurations, usageTypes, investmentTypes] = await Promise.all([
                prisma.propertyConfiguration.findMany({
                    where: { is_active: true },
                    orderBy: { display_order: 'asc' },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        icon: true,
                        display_order: true,
                        labels_json: true
                    }
                }),
                prisma.usageType.findMany({
                    where: { is_active: true },
                    orderBy: { display_order: 'asc' },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        icon: true,
                        display_order: true,
                        labels_json: true
                    }
                }),
                prisma.investmentType.findMany({
                    where: { is_active: true },
                    orderBy: { display_order: 'asc' },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        icon: true,
                        display_order: true,
                        labels_json: true
                    }
                })
            ]);

            res.json({
                categories: categories.map(cat => ({
                    id: cat.id,
                    name: cat.name,
                    slug: cat.slug,
                    icon: cat.icon,
                    description: cat.description,
                    display_order: cat.display_order,
                    labels: cat.labels_json,
                    subcategories: cat.sub_categories.map(sub => ({
                        id: sub.id,
                        name: sub.name,
                        slug: sub.slug,
                        icon: sub.icon,
                        display_order: sub.display_order,
                        labels: sub.labels_json,
                        validation_rules: sub.validation_rules,
                        types: sub.property_types.map(type => ({
                            id: type.id,
                            name: type.name,
                            slug: type.slug,
                            icon: type.icon,
                            display_order: type.display_order,
                            labels: type.labels_json
                        }))
                    }))
                })),
                configurations: configurations.map(c => ({
                    id: c.id,
                    name: c.name,
                    slug: c.slug,
                    icon: c.icon,
                    display_order: c.display_order,
                    labels: c.labels_json
                })),
                usage_types: usageTypes.map(u => ({
                    id: u.id,
                    name: u.name,
                    slug: u.slug,
                    icon: u.icon,
                    display_order: u.display_order,
                    labels: u.labels_json
                })),
                investment_types: investmentTypes.map(i => ({
                    id: i.id,
                    name: i.name,
                    slug: i.slug,
                    icon: i.icon,
                    display_order: i.display_order,
                    labels: i.labels_json
                }))
            });
        } catch (error) {
        captureRouteError(error, req, { route: 'classification#7' });
            logger.error('Error fetching classification tree', { error });
            res.status(500).json({ error: 'Failed to fetch classification tree' });
        }
    }
);

export default router;
