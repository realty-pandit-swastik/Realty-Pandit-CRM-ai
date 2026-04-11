/**
 * Natural Language Date/Time Parser
 * Extracts dates and times from user messages like:
 * - "tomorrow at 3 PM"
 * - "next Monday 10 AM"
 * - "day after tomorrow evening"
 * - "this weekend"
 */

interface ParsedDateTime {
    date: Date | null;
    time: string | null; // HH:MM format
    confidence: 'high' | 'medium' | 'low';
    original: string;
}

export class DateTimeParser {
    /**
     * Parse natural language date/time from message
     */
    parse(message: string): ParsedDateTime {
        const lowerMessage = message.toLowerCase();

        // Extract time first
        const time = this.extractTime(lowerMessage);

        // Extract date
        const date = this.extractDate(lowerMessage);

        // Determine confidence
        const confidence = this.getConfidence(date, time, lowerMessage);

        return {
            date,
            time,
            confidence,
            original: message,
        };
    }

    /**
     * Extract time from message
     */
    private extractTime(message: string): string | null {
        // Pattern: 3 PM, 10:30 AM, 15:00, etc.
        const timePatterns = [
            // 12-hour format with AM/PM
            /(\d{1,2})\s*(am|pm)/i,
            /(\d{1,2}):(\d{2})\s*(am|pm)/i,
            // 24-hour format
            /(\d{1,2}):(\d{2})/,
            // Relative times
            /morning/i,
            /afternoon/i,
            /evening/i,
            /night/i,
            /noon/i,
        ];

        // Check 12-hour format
        const match12hr = message.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
        if (match12hr) {
            let hour = parseInt(match12hr[1]);
            const minute = match12hr[2] || '00';
            const period = match12hr[3].toLowerCase();

            if (period === 'pm' && hour !== 12) hour += 12;
            if (period === 'am' && hour === 12) hour = 0;

            return `${hour.toString().padStart(2, '0')}:${minute}`;
        }

        // Check 24-hour format
        const match24hr = message.match(/(\d{1,2}):(\d{2})/);
        if (match24hr) {
            const hour = parseInt(match24hr[1]);
            const minute = match24hr[2];
            if (hour >= 0 && hour <= 23) {
                return `${hour.toString().padStart(2, '0')}:${minute}`;
            }
        }

        // Relative times
        if (message.includes('morning')) return '10:00';
        if (message.includes('afternoon')) return '14:00';
        if (message.includes('evening')) return '18:00';
        if (message.includes('night')) return '20:00';
        if (message.includes('noon')) return '12:00';

        return null;
    }

    /**
     * Extract date from message
     */
    private extractDate(message: string): Date | null {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Tomorrow
        if (message.includes('tomorrow')) {
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            return tomorrow;
        }

        // Day after tomorrow
        if (message.includes('day after tomorrow') || message.includes('overmorrow')) {
            const dayAfter = new Date(today);
            dayAfter.setDate(dayAfter.getDate() + 2);
            return dayAfter;
        }

        // Today
        if (message.includes('today') || message.includes('later today')) {
            return today;
        }

        // This weekend (Saturday)
        if (message.includes('this weekend') || message.includes('weekend')) {
            const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7;
            const saturday = new Date(today);
            saturday.setDate(saturday.getDate() + daysUntilSaturday);
            return saturday;
        }

        // Next week
        if (message.includes('next week')) {
            const nextWeek = new Date(today);
            nextWeek.setDate(nextWeek.getDate() + 7);
            return nextWeek;
        }

        // Specific day of week
        const dayMatch = message.match(/(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
        if (dayMatch) {
            const targetDay = dayMatch[2].toLowerCase();
            const isNext = !!dayMatch[1];
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const targetDayIndex = dayNames.indexOf(targetDay);
            const currentDayIndex = now.getDay();

            let daysAhead = targetDayIndex - currentDayIndex;
            if (daysAhead <= 0 || isNext) daysAhead += 7;

            const targetDate = new Date(today);
            targetDate.setDate(targetDate.getDate() + daysAhead);
            return targetDate;
        }

        // Specific date format: DD/MM, DD-MM, etc.
        const dateMatch = message.match(/(\d{1,2})[\/\-](\d{1,2})/);
        if (dateMatch) {
            const day = parseInt(dateMatch[1]);
            const month = parseInt(dateMatch[2]) - 1; // 0-indexed
            const year = now.getFullYear();

            const specificDate = new Date(year, month, day);
            // If date is in the past, assume next year
            if (specificDate < now) {
                specificDate.setFullYear(year + 1);
            }
            return specificDate;
        }

        return null;
    }

    /**
     * Determine confidence level
     */
    private getConfidence(date: Date | null, time: string | null, message: string): 'high' | 'medium' | 'low' {
        if (date && time) return 'high';
        if (date || time) return 'medium';

        // Check if message contains any date/time keywords
        const keywords = ['tomorrow', 'today', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'morning', 'afternoon', 'evening', 'night', 'am', 'pm'];
        const hasKeyword = keywords.some(kw => message.includes(kw));

        return hasKeyword ? 'low' : 'low';
    }

    /**
     * Format date for display
     */
    formatDate(date: Date): string {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        const dayName = days[date.getDay()];
        const monthName = months[date.getMonth()];
        const day = date.getDate();

        return `${dayName}, ${monthName} ${day}`;
    }

    /**
     * Format time for display (12-hour format)
     */
    formatTime(time: string): string {
        const [hourStr, minute] = time.split(':');
        let hour = parseInt(hourStr);
        const period = hour >= 12 ? 'PM' : 'AM';

        if (hour > 12) hour -= 12;
        if (hour === 0) hour = 12;

        return `${hour}:${minute} ${period}`;
    }

    /**
     * Get a user-friendly confirmation message
     */
    getConfirmationMessage(parsed: ParsedDateTime): string {
        if (!parsed.date && !parsed.time) {
            return 'When would you like to visit? (e.g., "tomorrow at 3 PM")';
        }

        let message = 'Visit scheduled for ';

        if (parsed.date) {
            message += this.formatDate(parsed.date);
        }

        if (parsed.time) {
            if (parsed.date) message += ' at ';
            message += this.formatTime(parsed.time);
        }

        if (parsed.confidence === 'medium' || parsed.confidence === 'low') {
            message += '. Is this correct?';
        } else {
            message += '. ✓';
        }

        return message;
    }
}
