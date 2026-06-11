/**
 * Email Service - Integrated with Panditji AI and SSOT
 * All emails are processed by ONE AI brain (Panditji)
 */

import * as nodemailer from 'nodemailer';
import { llmService } from './llm';
import logger from '../utils/logger';
import prisma from '../db';

// Email transporter (Postfix SMTP)
const transporter = nodemailer.createTransport({
    host: 'localhost',
    port: 25,
    secure: false,
    tls: {
        rejectUnauthorized: false
    }
});

interface EmailData {
    from: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    body?: string;
    html?: string;
    inReplyTo?: string;
    /** When set, send via this agent's own mailbox if they configured one (T9b). */
    senderAgentId?: string;
}

/**
 * Build a per-agent SMTP transporter from their saved config (T9b), or return
 * null to fall back to the shared Postfix relay.
 */
async function getSenderTransport(agentId?: string) {
    if (!agentId) return null;
    try {
        const a = await prisma.agent.findUnique({
            where: { id: agentId },
            select: {
                email: true, email_smtp_host: true, email_smtp_port: true,
                email_smtp_secure: true, email_smtp_username: true, email_smtp_password: true,
            },
        });
        if (!a?.email_smtp_host || !a.email_smtp_port || !a.email_smtp_password) return null;
        const { decryptSecret } = await import('../utils/crypto');
        let pass: string;
        try {
            pass = decryptSecret(a.email_smtp_password);
        } catch (e) {
            logger.error(`[EmailService] Could not decrypt SMTP password for agent ${agentId} — falling back to relay`);
            return null;
        }
        return {
            from: a.email,
            transport: nodemailer.createTransport({
                host: a.email_smtp_host,
                port: a.email_smtp_port,
                secure: !!a.email_smtp_secure,
                auth: { user: a.email_smtp_username || a.email, pass },
            }),
        };
    } catch (e) {
        logger.error('[EmailService] getSenderTransport failed:', e);
        return null;
    }
}

export class EmailService {
    /**
     * Send email (with optional AI generation)
     */
    async sendEmail(data: EmailData, tenantId: string, generateWithAI: boolean = false) {
        try {
            let { subject, body, html } = data;

            // If AI generation is requested and no body provided
            if (generateWithAI && !body) {
                const aiResponse = await this.generateEmailWithAI(data.to, data.subject || '');
                body = aiResponse.body;
                subject = subject || aiResponse.subject;
            }

            // Reject blank emails — body or html must have content
            if (!body && !html) {
                logger.warn(`[EmailService] Rejecting blank email to ${data.to} — no body or html provided`);
                return null;
            }

            // T9b: prefer the sender's own configured mailbox; else shared Postfix relay.
            const sender = await getSenderTransport(data.senderAgentId);
            const activeTransport = sender?.transport || transporter;
            const fromAddress = sender?.from
                ? (data.from && data.from.includes(sender.from) ? data.from : `${data.from || 'Realty Pandit'}`.replace(/<[^>]+>/, `<${sender.from}>`))
                : (data.from || `Realty Pandit <noreply@realtypandit.in>`);

            const info = await activeTransport.sendMail({
                from: fromAddress,
                to: data.to,
                cc: data.cc,
                bcc: data.bcc,
                subject: subject || 'Message from Realty Pandit',
                text: body,
                html: html || this.convertToHTML(body || ''),
                messageId: `<${Date.now()}.${Math.random().toString(36)}@realtypandit.in>`,
                inReplyTo: data.inReplyTo
            });

            // Find or create contact from email
            const contact = await this.getOrCreateContactFromEmail(data.to, tenantId);

            // Save to database (SSOT)
            const email = await prisma.email.create({
                data: {
                    tenant_id: tenantId,
                    phone_number: contact.phone_number,
                    from_email: data.from || 'noreply@realtypandit.in',
                    to_email: data.to,
                    cc: data.cc,
                    bcc: data.bcc,
                    subject,
                    body,
                    html,
                    direction: 'outbound',
                    status: 'sent',
                    message_id: info.messageId,
                    in_reply_to: data.inReplyTo,
                    ai_processed: generateWithAI,
                    sent_at: new Date()
                }
            });

            // Log interaction
            await prisma.interaction.create({
                data: {
                    tenant_id: tenantId,
                    phone_number: contact.phone_number,
                    channel: 'email',
                    direction: 'outbound',
                    event_type: 'email_sent',
                    content: `Email sent: ${subject}`,
                    metadata: { message_id: info.messageId }
                }
            });

            logger.info(`[EmailService] Sent email to ${data.to}`, { message_id: info.messageId });
            return email;
        } catch (error) {
            logger.error('[EmailService] Error sending email', error);
            throw error;
        }
    }

    /**
     * Process incoming email (forwarded from Postfix)
     */
    async processIncomingEmail(emailData: any, tenantId: string) {
        try {
            const { from, to, subject, text, html, messageId, inReplyTo, references } = emailData;

            logger.info(`[EmailService] Processing incoming email from ${from}`);

            // Find or create contact
            const contact = await this.getOrCreateContactFromEmail(from, tenantId);

            // Save raw email to database
            const email = await prisma.email.create({
                data: {
                    tenant_id: tenantId,
                    phone_number: contact.phone_number,
                    from_email: from,
                    to_email: to,
                    subject,
                    body: text,
                    html,
                    direction: 'inbound',
                    status: 'delivered',
                    message_id: messageId,
                    in_reply_to: inReplyTo,
                    references,
                    created_at: new Date()
                }
            });

            // Log interaction
            await prisma.interaction.create({
                data: {
                    tenant_id: tenantId,
                    phone_number: contact.phone_number,
                    channel: 'email',
                    direction: 'inbound',
                    event_type: 'email_received',
                    content: `Email received: ${subject}`,
                    metadata: { message_id: messageId }
                }
            });

            // PANDITJI AI PROCESSING - ONE AI CONTROLS ALL
            const aiResponse = await this.processWithPanditjiAI(email.id, contact.phone_number, text, tenantId);

            // Update email with AI response
            await prisma.email.update({
                where: { id: email.id },
                data: {
                    ai_processed: true,
                    ai_response: aiResponse.reply,
                    ai_confidence: aiResponse.confidence
                }
            });

            // If AI suggests a reply, send it automatically
            if (aiResponse.shouldReply && aiResponse.reply) {
                await this.sendEmail({
                    from: to,
                    to: from,
                    subject: `Re: ${subject}`,
                    body: aiResponse.reply,
                    inReplyTo: messageId
                }, tenantId, false);
            }

            logger.info(`[EmailService] Processed email ${messageId} with Panditji AI`);
            return email;
        } catch (error) {
            logger.error('[EmailService] Error processing incoming email', error);
            throw error;
        }
    }

    /**
     * Panditji AI processes the email (ONE AI controls everything)
     */
    private async processWithPanditjiAI(emailId: string, phoneNumber: string, content: string, tenantId: string) {
        try {
            // Get conversation history
            const history = await prisma.interaction.findMany({
                where: { phone_number: phoneNumber, tenant_id: tenantId },
                orderBy: { created_at: 'desc' },
                take: 10
            });

            const systemPrompt = `You are Panditji, the AI property assistant for Realty Pandit.
You are processing an email from a customer.

IMPORTANT: You control ALL communication channels - WhatsApp, Email, Phone, Website.
Maintain consistent context across all channels.

Previous interactions:
${history.map(i => `[${i.channel}] ${i.direction}: ${i.content}`).join('\n')}

Email content:
${content}

Analyze the email and:
1. Identify the customer's intent
2. Extract property requirements
3. Provide a helpful, professional response
4. Decide if immediate reply is needed

Response format:
{
  "intent": "...",
  "requirements": {...},
  "reply": "...",
  "shouldReply": true/false,
  "confidence": 0.0-1.0
}`;

            const response = await llmService.generateResponse(systemPrompt, content);

            try {
                return JSON.parse(response);
            } catch {
                // If not JSON, wrap in response object
                return {
                    intent: 'general_inquiry',
                    reply: response,
                    shouldReply: true,
                    confidence: 0.8
                };
            }
        } catch (error) {
            logger.error('[EmailService] Panditji AI processing error', error);
            return {
                intent: 'error',
                reply: 'Thank you for your email. Our team will respond shortly.',
                shouldReply: true,
                confidence: 0.5
            };
        }
    }

    /**
     * Generate email content using Panditji AI
     */
    private async generateEmailWithAI(toEmail: string, context: string) {
        try {
            const prompt = `Generate a professional email for:
To: ${toEmail}
Context: ${context}

Generate a friendly, professional email with subject and body.
Format as JSON: { "subject": "...", "body": "..." }`;

            const response = await llmService.generateResponse(prompt, '');
            return JSON.parse(response);
        } catch (error) {
            logger.error('[EmailService] AI email generation error', error);
            return {
                subject: 'Message from Realty Pandit',
                body: 'Thank you for your interest. Our team will contact you shortly.'
            };
        }
    }

    /**
     * Get or create contact from email address
     */
    private async getOrCreateContactFromEmail(email: string, tenantId: string) {
        try {
            // Try to find existing contact by email
            let contact = await prisma.contact.findFirst({
                where: { email, tenant_id: tenantId }
            });

            if (!contact) {
                // Create placeholder contact (email as identifier, placeholder phone)
                const placeholderPhone = `+91${Date.now().toString().slice(-10)}`;
                contact = await prisma.contact.create({
                    data: {
                        phone_number: placeholderPhone,
                        tenant_id: tenantId,
                        email,
                        name: email.split('@')[0],
                        source: 'email',
                        contact_type: 'UNKNOWN'
                    }
                });
                logger.info(`[EmailService] Created new contact for ${email}`);
            }

            return contact;
        } catch (error) {
            logger.error('[EmailService] Error getting/creating contact', error);
            throw error;
        }
    }

    /**
     * Convert plain text to HTML
     */
    private convertToHTML(text: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        ${text.split('\n').map(line => `<p>${line}</p>`).join('')}
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666;">
            Sent by Panditji AI Assistant<br>
            Realty Pandit | realtypandit.in | +91-8178491914
        </p>
    </div>
</body>
</html>`;
    }

    /**
     * Get all emails for a contact
     */
    async getEmailsForContact(phoneNumber: string, limit = 50) {
        return prisma.email.findMany({
            where: { phone_number: phoneNumber },
            orderBy: { created_at: 'desc' },
            take: limit
        });
    }

    /**
     * Search emails
     */
    async searchEmails(query: string, tenantId: string, limit = 50) {
        return prisma.email.findMany({
            where: {
                tenant_id: tenantId,
                OR: [
                    { from_email: { contains: query } },
                    { to_email: { contains: query } },
                    { subject: { contains: query } },
                    { body: { contains: query } }
                ]
            },
            orderBy: { created_at: 'desc' },
            take: limit
        });
    }
}

export const emailService = new EmailService();
