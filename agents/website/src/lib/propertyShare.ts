import { formatPrice, getImageUrls, getMediaUrl, isVideoUrl, type Property } from './api';
import { formatAddress, formatPropertyTitle, getAmenities, getFurnishing } from './propertyUtils';
import { getDisplayFloor } from './floor';

function humanize(value: unknown): string {
    return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function buildPropertyShareText(property: Property): string {
    const specs = property.specs || {};
    const isRent = ['rent', 'rent_lease', 'lease'].includes(property.intent);
    const area = specs['plot-area'] || specs.area;
    const areaUnit = specs['plot-area-unit'] || specs.area_unit || 'sqft';
    const furnishing = getFurnishing(property);
    const floor = getDisplayFloor(property);
    const facing = specs.facing;
    const amenities = getAmenities(property).slice(0, 4);

    return [
        'Namaste 🙏',
        `🏡 *${formatPropertyTitle(property, 'short')}*`,
        `📍 ${formatAddress(property) || 'Location on request'}`,
        `💰 ${isRent ? 'Rent' : 'Price'}: ${formatPrice(property.price, property.price_unit)}${isRent ? '/month' : ''}`,
        area ? `📐 ${area} ${areaUnit}` : '',
        furnishing ? `🛋️ ${humanize(furnishing)}` : '',
        floor ? `🏢 Floor: ${floor}` : '',
        facing ? `🧭 ${humanize(facing)} Facing` : '',
        amenities.length ? `✨ ${amenities.join(' · ')}` : '',
        '',
        'Reply here for more information or to schedule a visit.',
    ].filter((line, index) => line || index === 9).join('\n');
}

/** Fetch a concise WhatsApp-ready gallery: up to 8 photos and 2 videos. */
export async function getPropertyShareFiles(property: Property): Promise<File[]> {
    const photos = getImageUrls(property.media_urls)
        .filter(url => /\.(jpe?g|png|webp)(?:\?|$)/i.test(url))
        .slice(0, 8);
    const videos = [...new Set([
        ...(property.video_urls || []),
        ...(property.media_urls || []).filter(isVideoUrl),
    ])].slice(0, 2);
    const urls = [...photos, ...videos];

    const settled = await Promise.allSettled(urls.map(async (path, index) => {
        const response = await fetch(getMediaUrl(path));
        if (!response.ok) throw new Error(`Media fetch failed: ${response.status}`);
        const blob = await response.blob();
        const extension = blob.type.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg')
            || path.split('?')[0].split('.').pop()
            || (isVideoUrl(path) ? 'mp4' : 'jpg');
        return new File([blob], `realty-pandit-${property.display_id || property.id}-${index + 1}.${extension}`, {
            type: blob.type || (isVideoUrl(path) ? 'video/mp4' : 'image/jpeg'),
        });
    }));

    return settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
}

export async function sharePropertyOnWhatsApp(property: Property): Promise<void> {
    const text = buildPropertyShareText(property);
    try {
        const files = await getPropertyShareFiles(property);
        const canShareFiles = files.length > 0 && navigator.canShare?.({ files });
        if (navigator.share) {
            await navigator.share({
                title: formatPropertyTitle(property, 'short'),
                text,
                ...(canShareFiles ? { files } : {}),
            });
            return;
        }
    } catch (error) {
        if ((error as Error).name === 'AbortError') return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}
