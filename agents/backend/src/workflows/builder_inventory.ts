/**
 * Builder Project Upload Workflow - TASK-130
 * AI-powered project creation via WhatsApp conversation
 */

import { LLMService } from '../services/llm';
import prisma from '../db';
import logger from '../utils/logger';
import { ProjectStatus, ProjectListingStatus, ProjectType } from '@prisma/client';

export class BuilderInventoryWorkflow {
    private llmService: LLMService;

    constructor() {
        this.llmService = new LLMService();
    }

    /**
     * Detect if message indicates project upload intent
     */
    isProjectUploadIntent(message: string): boolean {
        const msg = message.toLowerCase();
        const keywords = [
            'add project',
            'new project',
            'upload project',
            'list project',
            'create project',
            'add building',
            'new development'
        ];
        return keywords.some(kw => msg.includes(kw));
    }

    /**
     * Handle project upload conversation
     * Uses AI to extract: Project name, type, city, location, price range, unit details
     */
    async handle(builderOwnerId: string, phone: string, message: string): Promise<any> {
        // Check if there's an active project upload session
        const sessionKey = `builder_project_${phone}`;
        let session = await this.getSession(sessionKey);

        if (!session) {
            // Start new project upload
            session = await this.startProjectUpload(sessionKey);
            return {
                action: 'reply',
                reply_script: `Let's add your new project! 🏗️\n\nPlease share the following details in your next message:\n\n1. Project name\n2. Project type (Residential/Commercial)\n3. Location (City & Locality)\n4. Price range\n5. Unit details (e.g., "2BHK: 50-60L, 3BHK: 75-90L")\n\nExample:\n"Godrej Garden City, Residential, Sector 27 Noida, 2BHK: 50-60L, 3BHK: 75-90L"`
            };
        }

        // Extract project data using AI
        return await this.extractAndCreateProject(builderOwnerId, phone, message, session);
    }

    /**
     * Use AI to extract project details from message
     */
    private async extractAndCreateProject(ownerId: string, phone: string, message: string, session: any): Promise<any> {
        try {
            // AI Extraction Prompt
            const extractionPrompt = `Extract the following project details from the builder's message:

Message: "${message}"

Extract in JSON format:
{
    "projectName": string,
    "projectType": "RESIDENTIAL" | "COMMERCIAL" | "MIXED_USE",
    "city": string,
    "locality": string,
    "reraNumber": string (if mentioned, else null),
    "priceRange": { "min": number, "max": number } (in lakhs),
    "units": [
        { "bhk": string, "priceMin": number, "priceMax": number, "status": "AVAILABLE" }
    ],
    "confidence": number (0-1)
}

Example extractions:
- "2BHK: 50-60L" → { "bhk": "2 BHK", "priceMin": 5000000, "priceMax": 6000000 }
- "3BHK: 75-90 lakhs" → { "bhk": "3 BHK", "priceMin": 7500000, "priceMax": 9000000 }

If information is missing, set as null. Return valid JSON only.`;

            const extractedData = await this.llmService.generateText(extractionPrompt);
            const projectData = JSON.parse(extractedData);

            // Validate confidence
            if (projectData.confidence < 0.6) {
                return {
                    action: 'reply',
                    reply_script: `I couldn't extract all details clearly. Please provide:\n\n✅ Project name\n✅ Type (Residential/Commercial)\n✅ Location (City & Locality)\n✅ Unit configurations with prices\n\nExample:\n"Green Valley Apartments, Residential, Sector 18 Noida, 2BHK: 50L, 3BHK: 75L"`
                };
            }

            // Get builder's tenant
            const owner = await prisma.owner.findUnique({
                where: { id: ownerId },
                include: { contact: true }
            });

            if (!owner || !owner.contact) {
                throw new Error('Builder not found');
            }

            // Create Project
            const project = await prisma.project.create({
                data: {
                    name: projectData.projectName,
                    slug: projectData.projectName.toLowerCase().replace(/\s+/g, '-'),
                    type: projectData.projectType,
                    city: projectData.city,
                    location: projectData.locality,
                    rera_number: projectData.reraNumber,
                    price_range_min: projectData.priceRange.min * 100000, // Convert lakhs to rupees
                    price_range_max: projectData.priceRange.max * 100000,
                    description: `${projectData.projectType} project in ${projectData.locality}, ${projectData.city}`,
                    owner_id: ownerId,
                    tenant_id: owner.contact.tenant_id,
                    status: ProjectStatus.DRAFT,
                    listing_status: ProjectListingStatus.ACTIVE
                }
            });

            // Create Units
            if (projectData.units && projectData.units.length > 0) {
                await prisma.projectUnit.createMany({
                    data: projectData.units.map((unit: any) => ({
                        project_id: project.id,
                        configuration: unit.bhk,
                        price_min: unit.priceMin * 100000,
                        price_max: unit.priceMax * 100000,
                        status: 'AVAILABLE',
                        total_units: 10 // Default, can be updated later
                    }))
                });
            }

            // Clear session
            await this.clearSession(`builder_project_${phone}`);

            logger.info('[BuilderInventory] Project created:', {
                projectId: project.id,
                name: projectData.projectName,
                ownerId
            });

            // Create interaction record
            await prisma.interaction.create({
                data: {
                    tenant_id: owner.contact.tenant_id,
                    phone_number: phone,
                    channel: 'whatsapp',
                    direction: 'inbound',
                    event_type: 'project_upload',
                    content: `Builder uploaded project: ${projectData.projectName}`,
                    metadata: {
                        project_id: project.id,
                        units_count: projectData.units?.length || 0
                    }
                }
            });

            const unitsText = projectData.units?.map((u: any) => `• ${u.bhk}: ₹${u.priceMin / 100000}-${u.priceMax / 100000}L`).join('\n');

            return {
                action: 'reply',
                reply_script: `✅ *Project Added Successfully!*\n\n📋 *${projectData.projectName}*\n📍 ${projectData.locality}, ${projectData.city}\n🏢 Type: ${projectData.projectType}\n\n*Units:*\n${unitsText}\n\nProject Status: DRAFT\n\n*Next Steps:*\n1. Login to your dashboard to activate the project\n2. Upload images and brochures\n3. Add RERA details\n\nDashboard: ${process.env.WEBSITE_URL || 'http://localhost:7575'}/builder/projects/${project.id}\n\nAdd another project? Just say *"add new project"*`
            };

        } catch (error) {
            logger.error('[BuilderInventory] Project creation failed:', error);
            return {
                action: 'reply',
                reply_script: `❌ Failed to create project: ${(error as Error).message}\n\nPlease check the details and try again.\n\nFormat:\n"Project Name, Residential/Commercial, City & Locality, Units with prices"`
            };
        }
    }

    /**
     * Session management (in-memory or Redis)
     */
    private sessions = new Map<string, any>();

    private async getSession(key: string) {
        return this.sessions.get(key);
    }

    private async startProjectUpload(key: string) {
        const session = {
            started_at: new Date(),
            step: 'COLLECTING_DETAILS'
        };
        this.sessions.set(key, session);
        return session;
    }

    private async clearSession(key: string) {
        this.sessions.delete(key);
    }
}

export const builderInventoryWorkflow = new BuilderInventoryWorkflow();
