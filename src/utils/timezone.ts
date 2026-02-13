import { formatInTimeZone } from 'date-fns-tz';

export const timezoneUtils = {
    /**
     * Convert a date to user's timezone
     */
    toUserTimezone(date: Date | string | null, userTimezone: string = 'UTC'): string | null {
        if (!date) return null;
        const dateObj = date instanceof Date ? date : new Date(date);
        return formatInTimeZone(dateObj, userTimezone, 'yyyy-MM-dd HH:mm:ss');
    },

    /**
     * Convert a date string to UTC for storage
     * The input dateString is assumed to be in the user's timezone
     */
    toUTC(dateString: Date | string | null, userTimezone: string = 'UTC'): string | null {
        if (!dateString) return null;
        try {
            // If it's already a Date object, treat it as UTC and return
            if (dateString instanceof Date) {
                return dateString.toISOString().slice(0, 19).replace('T', ' ');
            }
            
            // Parse the date string - it's in format "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD"
            // We need to treat this as if it's in the user's timezone
            let dateStr = dateString.toString().trim();
            
            // If only date is provided (YYYY-MM-DD), add default time (00:00:00)
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                dateStr += ' 00:00:00';
            }
            
            // Parse the date string components
            const [datePart, timePart] = dateStr.split(' ');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hours = 0, minutes = 0, seconds = 0] = (timePart || '00:00:00').split(':').map(Number);
            
            // We need to interpret the date string as being in the user's timezone
            // and convert it to UTC. We'll use Intl to calculate the offset.
            
            // Create a date string in ISO format
            const isoString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            
            // Create a date object - we'll use it to calculate timezone offset
            // First, create a date as if it's in UTC
            const utcDate = new Date(isoString + 'Z');
            
            // Now get what this UTC time looks like in the user's timezone
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: userTimezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            
            const parts = formatter.formatToParts(utcDate);
            const tzYear = parseInt(parts.find(p => p.type === 'year')?.value || '0');
            const tzMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0');
            const tzDay = parseInt(parts.find(p => p.type === 'day')?.value || '0');
            const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
            const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
            const tzSecond = parseInt(parts.find(p => p.type === 'second')?.value || '0');
            
            // Calculate the difference between what we want (user's local time) and what UTC gives us
            const desiredUTC = Date.UTC(year, month - 1, day, hours, minutes, seconds);
            const actualUTC = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond);
            const offsetMs = desiredUTC - actualUTC;
            
            // Adjust the UTC date by the offset to get the correct UTC time
            const correctUTC = new Date(utcDate.getTime() + offsetMs);
            
            // Format as UTC string
            return formatInTimeZone(correctUTC, 'UTC', 'yyyy-MM-dd HH:mm:ss');
        } catch (error) {
            console.error('Error converting timezone:', error);
            console.error('Input:', dateString, 'Timezone:', userTimezone);
            return dateString as string;
        }
    },

    /**
     * Get current date in user's timezone
     */
    getToday(userTimezone: string = 'UTC'): string {
        return formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd');
    },

    /**
     * Parse date string (supports "today", "tomorrow", or date strings)
     */
    parseDate(dateString: string | null | undefined, userTimezone: string = 'UTC'): string | null {
        if (!dateString) return null;
        
        const lower = dateString.toLowerCase().trim();
        
        if (lower === 'today') {
            return this.getToday(userTimezone);
        }
        
        if (lower === 'tomorrow') {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return formatInTimeZone(tomorrow, userTimezone, 'yyyy-MM-dd');
        }
        
        // Try to parse as date string
        try {
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                return formatInTimeZone(date, userTimezone, 'yyyy-MM-dd');
            }
        } catch (error) {
            console.error('Error parsing date:', error);
        }
        
        return dateString; // Return as-is if can't parse
    },

    /**
     * Parse date range (supports "this week", "next week", "today", "tomorrow", etc.)
     * Returns { startDate, endDate } or null
     */
    parseDateRange(dateRange: string | null | undefined, userTimezone: string = 'UTC'): { startDate: string; endDate: string } | null {
        if (!dateRange) return null;
        
        const lower = dateRange.toLowerCase().trim();
        const now = new Date();
        const today = this.getToday(userTimezone);
        
        // Single day queries
        if (lower === 'today' || lower === 'היום') {
            return { startDate: today, endDate: today };
        }
        
        if (lower === 'tomorrow' || lower === 'מחר') {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = formatInTimeZone(tomorrow, userTimezone, 'yyyy-MM-dd');
            return { startDate: tomorrowStr, endDate: tomorrowStr };
        }
        
        // Week queries
        if (lower === 'this week' || lower === 'השבוע' || lower === 'השבוע הזה') {
            const startOfWeek = new Date(now);
            const dayOfWeek = startOfWeek.getDay(); // 0 = Sunday, 1 = Monday, etc.
            // In Israel, week typically starts on Sunday (0)
            const daysToSubtract = dayOfWeek === 0 ? 0 : dayOfWeek;
            startOfWeek.setDate(startOfWeek.getDate() - daysToSubtract);
            startOfWeek.setHours(0, 0, 0, 0);
            
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);
            
            return {
                startDate: formatInTimeZone(startOfWeek, userTimezone, 'yyyy-MM-dd'),
                endDate: formatInTimeZone(endOfWeek, userTimezone, 'yyyy-MM-dd')
            };
        }
        
        if (lower === 'next week' || lower === 'השבוע הבא') {
            const nextWeekStart = new Date(now);
            const dayOfWeek = nextWeekStart.getDay();
            const daysToAdd = 7 - dayOfWeek; // Days until next Sunday
            nextWeekStart.setDate(nextWeekStart.getDate() + daysToAdd);
            nextWeekStart.setHours(0, 0, 0, 0);
            
            const nextWeekEnd = new Date(nextWeekStart);
            nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);
            nextWeekEnd.setHours(23, 59, 59, 999);
            
            return {
                startDate: formatInTimeZone(nextWeekStart, userTimezone, 'yyyy-MM-dd'),
                endDate: formatInTimeZone(nextWeekEnd, userTimezone, 'yyyy-MM-dd')
            };
        }
        
        // Month queries
        if (lower === 'this month' || lower === 'החודש' || lower === 'החודש הזה') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            
            return {
                startDate: formatInTimeZone(startOfMonth, userTimezone, 'yyyy-MM-dd'),
                endDate: formatInTimeZone(endOfMonth, userTimezone, 'yyyy-MM-dd')
            };
        }
        
        if (lower === 'next month' || lower === 'החודש הבא') {
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
            
            return {
                startDate: formatInTimeZone(nextMonthStart, userTimezone, 'yyyy-MM-dd'),
                endDate: formatInTimeZone(nextMonthEnd, userTimezone, 'yyyy-MM-dd')
            };
        }
        
        // Try to parse as single date
        const singleDate = this.parseDate(dateRange, userTimezone);
        if (singleDate) {
            return { startDate: singleDate, endDate: singleDate };
        }
        
        return null;
    },

    /**
     * Parse datetime string
     */
    parseDateTime(dateTimeString: string | null | undefined, userTimezone: string = 'UTC'): string | null {
        if (!dateTimeString) return null;
        
        try {
            // Try to parse common formats
            const date = new Date(dateTimeString);
            if (!isNaN(date.getTime())) {
                return formatInTimeZone(date, userTimezone, 'yyyy-MM-dd HH:mm:ss');
            }
        } catch (error) {
            console.error('Error parsing datetime:', error);
        }
        
        return dateTimeString;
    }
};
